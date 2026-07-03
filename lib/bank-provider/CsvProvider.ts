import { createHash } from "crypto";

// CSV statement parsing for accounts that can't (or won't) connect via
// Plaid — Apple Card, unsupported banks, privacy-conscious users.
// Detects common export formats by header sniffing; falls back to a
// generic Date/Description/Amount reader. Batch-only by design: CSV
// accounts never generate real-time Slack pings.

export interface CsvRow {
  externalTxId: string; // stable hash of date|amount|description
  date: string; // YYYY-MM-DD
  merchantRaw: string;
  amount: string; // absolute, 2dp
  direction: "outflow" | "inflow";
}

export interface CsvParseResult {
  format: string;
  rows: CsvRow[];
  skipped: number;
}

// Minimal CSV line parser handling quoted fields with commas
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function toIsoDate(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // US M/D/Y
  if (m) {
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${yr}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[$,()\s]/g, "");
  if (cleaned === "" || isNaN(Number(cleaned))) return null;
  let n = Number(cleaned);
  // parenthesized negatives: (12.34)
  if (/\(.*\)/.test(s)) n = -Math.abs(n);
  return n;
}

function hashId(date: string, amount: string, desc: string): string {
  return (
    "csv-" +
    createHash("sha1").update(`${date}|${amount}|${desc}`).digest("hex").slice(0, 24)
  );
}

type FormatSpec = {
  name: string;
  match: (headers: string[]) => boolean;
  dateCol: (headers: string[]) => number;
  descCol: (headers: string[]) => number;
  amountCol: (headers: string[]) => number;
  // true when a POSITIVE amount means money spent (Apple Card, Amex)
  positiveIsOutflow: boolean;
};

const findCol = (headers: string[], ...names: string[]) =>
  headers.findIndex((h) => names.some((n) => h.toLowerCase() === n.toLowerCase()));

const FORMATS: FormatSpec[] = [
  {
    // Apple Card: Transaction Date, Clearing Date, Description, Merchant,
    // Category, Type, Amount (USD) — purchases are positive
    name: "apple-card",
    match: (h) =>
      findCol(h, "Amount (USD)") >= 0 && findCol(h, "Clearing Date") >= 0,
    dateCol: (h) => findCol(h, "Transaction Date"),
    descCol: (h) => {
      const m = findCol(h, "Merchant");
      return m >= 0 ? m : findCol(h, "Description");
    },
    amountCol: (h) => findCol(h, "Amount (USD)"),
    positiveIsOutflow: true,
  },
  {
    // Amex: Date, Description, Amount — charges are positive
    name: "amex",
    match: (h) =>
      findCol(h, "Date") >= 0 &&
      findCol(h, "Description") >= 0 &&
      findCol(h, "Amount") >= 0 &&
      findCol(h, "Post Date") < 0 &&
      h.length <= 6,
    dateCol: (h) => findCol(h, "Date"),
    descCol: (h) => findCol(h, "Description"),
    amountCol: (h) => findCol(h, "Amount"),
    positiveIsOutflow: true,
  },
  {
    // Chase card: Transaction Date, Post Date, Description, Category, Type,
    // Amount — purchases are negative
    name: "chase",
    match: (h) =>
      findCol(h, "Transaction Date") >= 0 && findCol(h, "Post Date") >= 0,
    dateCol: (h) => findCol(h, "Transaction Date"),
    descCol: (h) => findCol(h, "Description"),
    amountCol: (h) => findCol(h, "Amount"),
    positiveIsOutflow: false,
  },
  {
    // Generic bank export: any Date + Description/Payee + Amount columns.
    // Convention: negative = money out (most checking exports)
    name: "generic",
    match: (h) =>
      h.some((x) => /date/i.test(x)) &&
      h.some((x) => /(description|payee|merchant|name)/i.test(x)) &&
      h.some((x) => /amount/i.test(x)),
    dateCol: (h) => h.findIndex((x) => /date/i.test(x)),
    descCol: (h) => h.findIndex((x) => /(description|payee|merchant|name)/i.test(x)),
    amountCol: (h) => h.findIndex((x) => /amount/i.test(x)),
    positiveIsOutflow: false,
  },
];

export function parseCsvStatement(text: string): CsvParseResult {
  const lines = text
    .replace(/^﻿/, "") // BOM
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return { format: "empty", rows: [], skipped: 0 };
  }

  const headers = splitCsvLine(lines[0]);
  const format = FORMATS.find((f) => f.match(headers));
  if (!format) return { format: "unrecognized", rows: [], skipped: lines.length - 1 };

  const di = format.dateCol(headers);
  const ci = format.descCol(headers);
  const ai = format.amountCol(headers);

  const rows: CsvRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const date = toIsoDate(cells[di] ?? "");
    const desc = (cells[ci] ?? "").trim();
    const amt = parseAmount(cells[ai] ?? "");
    if (!date || !desc || amt === null || amt === 0) {
      skipped++;
      continue;
    }
    const outflow = format.positiveIsOutflow ? amt > 0 : amt < 0;
    const abs = Math.abs(amt).toFixed(2);
    rows.push({
      externalTxId: hashId(date, abs, desc),
      date,
      merchantRaw: desc,
      amount: abs,
      direction: outflow ? "outflow" : "inflow",
    });
  }
  return { format: format.name, rows, skipped };
}
