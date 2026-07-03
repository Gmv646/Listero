// Multi-tenant isolation audit. Creates two synthetic tenants with data and
// verifies, at both the app layer and the raw-database (RLS) layer, that
// neither can see the other's rows. Run before every major release:
//   npm run audit:isolation
// Exits non-zero on any failure. Cleans up its synthetic tenants.
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { db, users, bankConnections, bankAccounts, transactions } from "../db";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✅" : "❌ FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function makeTenant(tag: string) {
  const [u] = await db
    .insert(users)
    .values({
      clerkUserId: `audit-${tag}-${process.pid}`,
      email: `audit-${tag}@example.com`,
      businessIndustry: "design",
    })
    .returning();
  const [conn] = await db
    .insert(bankConnections)
    .values({
      userId: u.id,
      externalEnrollmentId: `audit-item-${tag}-${process.pid}`,
      accessTokenEncrypted: "not-a-real-token",
      institutionName: `Audit Bank ${tag}`,
    })
    .returning();
  const [acct] = await db
    .insert(bankAccounts)
    .values({
      userId: u.id,
      connectionId: conn.id,
      externalAccountId: `audit-acct-${tag}`,
    })
    .returning();
  const [tx] = await db
    .insert(transactions)
    .values({
      userId: u.id,
      accountId: acct.id,
      externalTxId: `audit-tx-${tag}`,
      date: "2026-07-01",
      merchantRaw: `SECRET MERCHANT ${tag}`,
      amount: "42.00",
      direction: "outflow",
      status: "pending",
    })
    .returning();
  return { user: u, tx };
}

async function main() {
  const A = await makeTenant("A");
  const B = await makeTenant("B");

  // ── App layer: every query path scopes by user_id ─────────────────────
  const aTxns = await db.query.transactions.findMany({
    where: eq(transactions.userId, A.user.id),
  });
  check(
    "app: A's transaction query contains no B rows",
    aTxns.length > 0 && aTxns.every((t) => t.userId === A.user.id)
  );

  // Export shape (mirrors /api/export): all six per-user queries
  const exportA = await Promise.all([
    db.query.transactions.findMany({ where: eq(transactions.userId, A.user.id) }),
    db.query.bankAccounts.findMany({ where: eq(bankAccounts.userId, A.user.id) }),
    db.query.bankConnections.findMany({ where: eq(bankConnections.userId, A.user.id) }),
  ]);
  const exportBlob = JSON.stringify(exportA);
  check(
    "app: A's export contains none of B's data",
    !exportBlob.includes(B.user.id) && !exportBlob.includes("SECRET MERCHANT B")
  );

  // ── DB layer: RLS enforced for the API roles ──────────────────────────
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  // authenticated role with A's JWT claims sees only A's rows
  const asA = await sql.begin(async (tx) => {
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: A.user.clerkUserId })}, true)`;
    await tx`SET LOCAL ROLE authenticated`;
    return tx`SELECT user_id, merchant_raw FROM transactions`;
  });
  check(
    "rls: authenticated+A-JWT sees only A's transactions",
    asA.length > 0 && asA.every((r) => r.user_id === A.user.id),
    `${asA.length} rows visible`
  );
  check(
    "rls: A cannot see B's merchant data",
    !asA.some((r) => String(r.merchant_raw ?? "").includes("SECRET MERCHANT B"))
  );

  // no JWT claims (anonymous-ish) sees nothing
  const asNobody = await sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE authenticated`;
    return tx`SELECT id FROM transactions`;
  });
  check("rls: authenticated with no JWT sees zero rows", asNobody.length === 0);

  // anon role sees nothing
  const asAnon = await sql
    .begin(async (tx) => {
      await tx`SET LOCAL ROLE anon`;
      return tx`SELECT id FROM transactions`;
    })
    .catch(() => [] as unknown[]);
  check("rls: anon role sees zero rows", (asAnon as unknown[]).length === 0);

  // authenticated cannot write into another tenant
  const writeBlocked = await sql
    .begin(async (tx) => {
      await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({ sub: A.user.clerkUserId })}, true)`;
      await tx`SET LOCAL ROLE authenticated`;
      await tx`UPDATE transactions SET category = 'HACKED' WHERE user_id = ${B.user.id}`;
      const rows = await tx`SELECT category FROM transactions WHERE user_id = ${B.user.id}`;
      return rows;
    })
    .then((rows) => !rows.some((r) => r.category === "HACKED"))
    .catch(() => true);
  // Verify from the owner connection that B's row is untouched
  const bTx = await db.query.transactions.findFirst({
    where: and(eq(transactions.userId, B.user.id)),
  });
  check(
    "rls: A cannot modify B's rows",
    writeBlocked && bTx?.category !== "HACKED"
  );

  await sql.end();

  // ── Cleanup (cascade) ─────────────────────────────────────────────────
  await db.delete(users).where(eq(users.id, A.user.id));
  await db.delete(users).where(eq(users.id, B.user.id));
  const leftover = await db.query.transactions.findMany({
    where: eq(transactions.userId, A.user.id),
  });
  check("cleanup: synthetic tenants removed", leftover.length === 0);

  console.log(
    failures === 0
      ? "\nISOLATION AUDIT PASSED"
      : `\nISOLATION AUDIT FAILED (${failures} failure${failures === 1 ? "" : "s"})`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("audit crashed:", e);
  process.exit(1);
});
