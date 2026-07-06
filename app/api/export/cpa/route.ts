import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db, bankAccounts, bankConnections, transactions } from "@/db";
import { getOrCreateUser } from "@/lib/user";
import { cleanMerchant } from "@/lib/display";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Confidence-routed CPA export: one CSV, narrative in its own cell,
// confidence + needs-review reason in separate sortable cells so a CPA
// can sort by confidence and start with what needs human judgment.
export async function GET() {
  const user = await getOrCreateUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [txns, accounts, connections] = await Promise.all([
    db.query.transactions.findMany({
      where: eq(transactions.userId, user.id),
      orderBy: [asc(transactions.date)],
    }),
    db.query.bankAccounts.findMany({ where: eq(bankAccounts.userId, user.id) }),
    db.query.bankConnections.findMany({
      where: eq(bankConnections.userId, user.id),
    }),
  ]);
  const connById = new Map(connections.map((c) => [c.id, c]));
  const acctLabel = new Map(
    accounts.map((a) => [
      a.id,
      `${(a.connectionId && connById.get(a.connectionId)?.institutionName) || "Bank"}${a.lastFour ? ` ..${a.lastFour}` : ""}`,
    ])
  );

  const header = [
    "Date",
    "Merchant",
    "Account",
    "Amount",
    "Direction",
    "Category",
    "Business/Personal",
    "Deductible %",
    "Status",
    "Archived",
    "Narrative",
    "Confidence (0-1)",
    "Needs CPA review — reason",
    "User note",
    "Receipt link",
  ];
  const lines = [header.join(",")];
  for (const t of txns) {
    const receipt = (t.receiptMeta as { permalink?: string } | null)?.permalink;
    lines.push(
      [
        t.date,
        cleanMerchant(t),
        t.accountId ? (acctLabel.get(t.accountId) ?? "") : "",
        `${t.direction === "outflow" ? "-" : ""}${t.amount}`,
        t.direction,
        t.category ?? "",
        t.businessPersonal ?? "",
        t.deductiblePct ?? "",
        t.status ?? "",
        t.archived ? "yes" : "",
        t.cpaNarrative ?? t.userNote ?? "",
        t.positionConfidence ?? t.confidence ?? "",
        t.cpaReviewReason ?? "",
        t.userNote ?? "",
        receipt ?? "",
      ]
        .map(csvCell)
        .join(",")
    );
  }

  return new NextResponse(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="listero-cpa-export.csv"',
    },
  });
}
