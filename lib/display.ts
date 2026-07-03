import type { Transaction } from "@/db";

// Presentation helpers for transaction rows. Pure functions, no data access.

const CATEGORY_ICONS: Record<string, string> = {
  Equipment: "🧰",
  "Software & subscriptions": "💻",
  "Contract labor": "🤝",
  "Advertising & marketing": "📣",
  Travel: "✈️",
  "Meals (business)": "🍽️",
  "Vehicle & mileage": "🚗",
  "Home office": "🏠",
  "Office supplies": "📦",
  "Rent & studio space": "🏢",
  "Education & training": "🎓",
  Insurance: "🛡️",
  "Professional services": "💼",
  "Bank & payment fees": "🏦",
  "Phone & internet": "📶",
  "Client gifts": "🎁",
  Income: "↙️",
  Refund: "↩️",
  "Internal transfer": "🔁",
  Personal: "👤",
  Other: "🧾",
};

export function categoryIcon(tx: Transaction): string {
  if (tx.businessPersonal === "internal") return "🔁";
  if (tx.category && CATEGORY_ICONS[tx.category]) {
    return CATEGORY_ICONS[tx.category];
  }
  return tx.direction === "inflow" ? "↙️" : "🧾";
}

// Well-known payment processors/institutions → friendly short names
const COMPANY_ALIASES: Record<string, string> = {
  americanexpress: "Amex",
  "american express": "Amex",
  amex: "Amex",
  chase: "Chase",
  "capital one": "Capital One",
  capitalone: "Capital One",
  citi: "Citi",
  citibank: "Citi",
  discover: "Discover",
  "bank of america": "Bank of America",
  bankofamerica: "Bank of America",
  wellsfargo: "Wells Fargo",
  "wells fargo": "Wells Fargo",
  barclays: "Barclays",
  synchrony: "Synchrony",
  usbank: "US Bank",
  "us bank": "US Bank",
};

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-/&.*])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

function aliasFor(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+co$/, "").trim();
  return COMPANY_ALIASES[key] ?? titleCase(key);
}

type MerchantFields = Pick<Transaction, "merchantDisplay" | "merchantRaw">;

// Bank descriptors are often SHOUTING, wrapped in ACH metadata, or both.
// "ORIG CO NAME:AMERICANEXPRESS CO ENTRY DESCR:..." → "Amex payment"
// "PAYMENT TO CHASE CARD ENDING IN 4972 07/02"     → "Chase card payment"
// "SQ *JOES COFFEE AUSTIN PPD ID: 12345"           → "Sq *Joes Coffee Austin"
export function cleanMerchant(tx: MerchantFields): string {
  const raw = (tx.merchantDisplay ?? tx.merchantRaw ?? "").trim();
  if (!raw) return "Unknown merchant";

  // ACH originator wrapper: extract the company name, call it a payment
  const ach = raw.match(
    /ORIG CO NAME:\s*([A-Za-z0-9 &.']+?)(?:\s+(?:CO\s+)?(?:ENTRY|ORIG|DESCR|ID)\b|$)/i
  );
  if (ach) return `${aliasFor(ach[1])} payment`;

  // "PAYMENT TO <BANK> CARD ..." → "<Bank> card payment"
  const cardPmt = raw.match(/PAYMENT TO\s+([A-Za-z ]+?)\s+CARD\b/i);
  if (cardPmt) return `${aliasFor(cardPmt[1])} card payment`;

  // "<BANK> CREDIT CRD AUTOPAY ..." → "<Bank> card payment"
  const autopay = raw.match(/^([A-Za-z ]+?)\s+CREDIT\s+CRD\s+AUTOPAY/i);
  if (autopay) return `${aliasFor(autopay[1])} card payment`;

  // "<KNOWN BANK> TRANSFER/PAYMENT 000123…" → "<Bank> transfer/payment"
  // Only for known institutions, so real merchants aren't mangled.
  const instMove = raw.match(/^([A-Za-z .&]+?)\s+(TRANSFER|PAYMENT|PMT)\b/i);
  if (instMove && COMPANY_ALIASES[instMove[1].trim().toLowerCase()]) {
    const verb = instMove[2].toLowerCase() === "transfer" ? "transfer" : "payment";
    return `${aliasFor(instMove[1])} ${verb}`;
  }

  // Generic trailing bank noise
  let s = raw
    .replace(/\s+(PPD|WEB|CCD|TEL)\s+ID:\s*\S+.*$/i, "")
    .replace(/\s+ENTRY DESCR:.*$/i, "")
    .replace(/\s+SEC:\s*\S+.*$/i, "")
    .replace(/\s+TRACE\s*#?:?\s*\S+.*$/i, "")
    .replace(/\s+IND\s+ID:.*$/i, "")
    .replace(/\s+CO\s+ID:.*$/i, "")
    .replace(/\s+\d{2}\/\d{2}(\/\d{2,4})?$/, "")
    .replace(/\s+\d{6,}\s*$/, "") // long trailing reference numbers
    .replace(/\s{2,}/g, " ")
    .trim();

  // De-SHOUT mostly-uppercase strings
  const letters = s.replace(/[^a-zA-Z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "");
  if (letters.length > 3 && upper.length / letters.length > 0.8) {
    s = titleCase(s);
  }
  return s.length > 48 ? s.slice(0, 45).trimEnd() + "…" : s;
}

export type StatusTone = "green" | "amber" | "muted" | "ink" | "coral";

// One meaningful label per row — what this transaction means for the
// user's books, not a raw DB status.
export function statusLabel(tx: Transaction): {
  text: string;
  tone: StatusTone;
} {
  if (tx.businessPersonal === "internal") {
    return { text: "internal transfer · nets to zero", tone: "muted" };
  }

  if (tx.status === "confirmed") {
    if (tx.businessPersonal === "personal") {
      return { text: "personal", tone: "muted" };
    }
    switch (tx.category) {
      case "Income":
        return { text: "revenue ✓", tone: "green" };
      case "Refund":
        return { text: "refund · offsets expense", tone: "green" };
      case "Contract labor":
        return { text: "business · track for 1099", tone: "coral" };
      case "Meals (business)":
        return { text: "business · 50% deductible", tone: "ink" };
      case "Client gifts":
        return { text: "business · flag for CPA ($25 cap)", tone: "amber" };
      default:
        return { text: "business · 100%", tone: "green" };
    }
  }

  // pending / auto — awaiting the user's tap
  if (tx.direction === "inflow") {
    return {
      text: tx.category === "Refund" ? "confirm refund" : "confirm revenue",
      tone: "amber",
    };
  }
  return { text: "confirm business", tone: "amber" };
}

export const TONE_CLASSES: Record<StatusTone, string> = {
  green: "text-green-700",
  amber: "text-amber-700",
  muted: "text-ink-soft/70",
  ink: "text-ink-soft",
  coral: "text-coral",
};
