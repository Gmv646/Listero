import { and, eq, gte, lte, ne } from "drizzle-orm";
import { db, transactions, type Transaction } from "@/db";

// Internal-transfer and refund detection. Fully generic: works for any user
// with any set of connected institutions. Never references specific banks.

export const INTERNAL = "internal";
export const INTERNAL_CATEGORY = "Internal transfer";

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.abs(
    (new Date(a + "T00:00:00Z").getTime() - new Date(b + "T00:00:00Z").getTime()) /
      86_400_000
  );
}

// Cross-account pair: a debit on one of the user's accounts matching a
// credit on another of their accounts, same absolute amount, within ±3 days.
export async function findTransferPair(
  tx: Transaction
): Promise<Transaction | null> {
  if (!tx.userId || !tx.accountId) return null;

  const candidates = await db.query.transactions.findMany({
    where: and(
      eq(transactions.userId, tx.userId),
      eq(transactions.amount, tx.amount),
      eq(
        transactions.direction,
        tx.direction === "outflow" ? "inflow" : "outflow"
      ),
      ne(transactions.accountId, tx.accountId),
      ne(transactions.id, tx.id),
      ne(transactions.status, "confirmed"),
      gte(transactions.date, shiftDate(tx.date, -3)),
      lte(transactions.date, shiftDate(tx.date, 3))
    ),
  });

  // A leg already classified as a transfer found its partner previously
  const unpaired = candidates.filter((c) => c.category !== INTERNAL_CATEGORY);
  unpaired.sort(
    (a, b) => daysBetween(a.date, tx.date) - daysBetween(b.date, tx.date)
  );
  return unpaired[0] ?? null;
}

// The bank's own signal: Plaid's personal_finance_category marks credit-card
// payments and own-account transfers. Generic across all US institutions.
export function plaidTransferSignal(
  tx: Transaction
): "card-payment" | "account-transfer" | null {
  const pfc = (
    tx.rawData as {
      personal_finance_category?: { primary?: string; detailed?: string };
    } | null
  )?.personal_finance_category;
  const detailed = pfc?.detailed ?? "";
  if (detailed === "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT") return "card-payment";
  if (
    detailed === "TRANSFER_OUT_ACCOUNT_TRANSFER" ||
    detailed === "TRANSFER_IN_ACCOUNT_TRANSFER"
  ) {
    return "account-transfer";
  }
  return null;
}

// Refund heuristic: a credit matching a debit from the same merchant within
// the prior 30 days, where the debit is at least as large as the credit.
export async function findRefundOrigin(
  tx: Transaction
): Promise<Transaction | null> {
  if (!tx.userId || tx.direction !== "inflow") return null;
  const merchant = (tx.merchantDisplay ?? tx.merchantRaw)?.toLowerCase().trim();
  if (!merchant) return null;

  const debits = await db.query.transactions.findMany({
    where: and(
      eq(transactions.userId, tx.userId),
      eq(transactions.direction, "outflow"),
      gte(transactions.date, shiftDate(tx.date, -30)),
      lte(transactions.date, tx.date)
    ),
    limit: 500,
  });

  return (
    debits.find((d) => {
      const m = (d.merchantDisplay ?? d.merchantRaw)?.toLowerCase().trim();
      if (!m) return false;
      const sameMerchant = m.includes(merchant) || merchant.includes(m);
      return sameMerchant && Number(d.amount) >= Number(tx.amount);
    }) ?? null
  );
}

export async function markInternalTransfer(
  txId: string,
  reasoning: string
): Promise<void> {
  await db
    .update(transactions)
    .set({
      category: INTERNAL_CATEGORY,
      businessPersonal: INTERNAL,
      status: "auto",
      confidence: "0.9",
      reasoning,
    })
    .where(eq(transactions.id, txId));
}
