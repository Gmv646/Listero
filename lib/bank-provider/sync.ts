import { and, eq, inArray, ne } from "drizzle-orm";
import { db, bankAccounts, bankConnections, transactions } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { getBankProvider, type NormalizedTransaction } from ".";

// Pulls all pending updates for a connection through the provider's sync
// cursor and reconciles them into the transactions table.
// Returns ids of newly inserted transactions so the caller can run the
// categorization pipeline + Slack notification on them.
export async function syncConnection(
  connectionId: string
): Promise<{ insertedTxIds: string[] }> {
  const conn = await db.query.bankConnections.findFirst({
    where: eq(bankConnections.id, connectionId),
  });
  if (!conn || conn.status !== "active" || !conn.userId) {
    return { insertedTxIds: [] };
  }

  const provider = getBankProvider();
  const accessToken = decryptSecret(conn.accessTokenEncrypted);

  const accounts = await db.query.bankAccounts.findMany({
    where: eq(bankAccounts.connectionId, conn.id),
  });
  const accountByExternalId = new Map(
    accounts.map((a) => [a.externalAccountId, a])
  );

  const isInitialSync = conn.syncCursor == null;
  // Defensive 30-day floor on first sync (Link already requests 30 days)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const insertedTxIds: string[] = [];
  let cursor = conn.syncCursor;

  try {
    for (;;) {
      const page = await provider.syncTransactions(accessToken, cursor);

      for (const t of [...page.added, ...page.modified]) {
        if (isInitialSync && t.date < cutoffStr) continue;
        const inserted = await upsertTransaction(conn.userId, t, accountByExternalId);
        if (inserted) insertedTxIds.push(inserted);
      }

      if (page.removedIds.length > 0) {
        // Drop removed transactions unless the user already confirmed them
        const accountIds = accounts.map((a) => a.id);
        if (accountIds.length > 0) {
          await db
            .delete(transactions)
            .where(
              and(
                inArray(transactions.externalTxId, page.removedIds),
                inArray(transactions.accountId, accountIds),
                ne(transactions.status, "confirmed")
              )
            );
        }
      }

      cursor = page.nextCursor;
      if (!page.hasMore) break;
    }
  } catch (err) {
    if (isConnectionLostError(err)) {
      await markConnectionLost(conn.id);
      return { insertedTxIds };
    }
    throw err;
  }

  await db
    .update(bankConnections)
    .set({ syncCursor: cursor })
    .where(eq(bankConnections.id, conn.id));

  return { insertedTxIds };
}

// Returns the new transaction id when a genuinely new row was inserted.
async function upsertTransaction(
  userId: string,
  t: NormalizedTransaction,
  accountByExternalId: Map<string, { id: string }>
): Promise<string | null> {
  const account = accountByExternalId.get(t.externalAccountId);
  if (!account) return null; // account not tracked (e.g. filtered type)

  // Posted transaction replacing a pending one we already have: update the
  // existing row in place, preserving any category/status the user set.
  if (t.replacesExternalTxId) {
    const existingPending = await db.query.transactions.findFirst({
      where: and(
        eq(transactions.externalTxId, t.replacesExternalTxId),
        eq(transactions.accountId, account.id)
      ),
    });
    if (existingPending) {
      await db
        .update(transactions)
        .set({
          externalTxId: t.externalTxId,
          date: t.date,
          amount: t.amount,
          merchantRaw: t.merchantRaw,
          merchantDisplay: t.merchantDisplay,
          rawData: t.raw,
        })
        .where(eq(transactions.id, existingPending.id));
      return null;
    }
  }

  const existing = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.externalTxId, t.externalTxId),
      eq(transactions.accountId, account.id)
    ),
  });

  if (existing) {
    // Modified transaction: refresh facts, never touch user decisions
    await db
      .update(transactions)
      .set({
        date: t.date,
        amount: t.amount,
        merchantRaw: t.merchantRaw,
        merchantDisplay: t.merchantDisplay,
        rawData: t.raw,
      })
      .where(eq(transactions.id, existing.id));
    return null;
  }

  const [inserted] = await db
    .insert(transactions)
    .values({
      userId,
      accountId: account.id,
      externalTxId: t.externalTxId,
      date: t.date,
      merchantRaw: t.merchantRaw,
      merchantDisplay: t.merchantDisplay,
      amount: t.amount,
      currency: t.currency,
      direction: t.direction,
      status: "pending",
      rawData: t.raw,
    })
    .returning({ id: transactions.id });

  return inserted?.id ?? null;
}

function isConnectionLostError(err: unknown): boolean {
  const code = (err as { response?: { data?: { error_code?: string } } })
    ?.response?.data?.error_code;
  return code === "ITEM_LOGIN_REQUIRED" || code === "ITEM_NOT_FOUND";
}

export async function markConnectionLost(connectionId: string) {
  await db
    .update(bankConnections)
    .set({ status: "disconnected", disconnectedAt: new Date() })
    .where(eq(bankConnections.id, connectionId));
}
