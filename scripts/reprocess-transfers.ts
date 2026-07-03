// One-off/repeatable fix for already-imported data: re-runs the deterministic
// classification layers (transfer pairs, Plaid signal, transfer rules, and
// inflow refund/revenue proposals) over every user's unconfirmed
// transactions. No Slack DMs, no Claude spend, user-confirmed rows untouched.
// Run: npx tsx scripts/reprocess-transfers.ts
import { eq, ne, and, isNotNull } from "drizzle-orm";
import { db, transactions, users } from "../db";
import { onNewTransactions } from "../lib/pipeline";

async function main() {
  const allUsers = await db.query.users.findMany();
  let total = 0;

  for (const user of allUsers) {
    const rows = await db.query.transactions.findMany({
      where: and(
        eq(transactions.userId, user.id),
        ne(transactions.status, "confirmed"),
        isNotNull(transactions.accountId)
      ),
      orderBy: (t, { asc }) => [asc(t.date)],
    });
    if (rows.length === 0) continue;

    await onNewTransactions(
      user.id,
      rows.map((r) => r.id),
      { notify: false, allowClaude: false }
    );
    console.log(`${user.email}: reprocessed ${rows.length} transactions`);
    total += rows.length;
  }

  // Summary of what the reclassification produced
  const internals = await db.query.transactions.findMany({
    where: eq(transactions.businessPersonal, "internal"),
  });
  console.log(
    `\nDone. ${total} reprocessed; ${internals.length} now classified as internal transfers.`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
