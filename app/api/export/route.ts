import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  db,
  transactions,
  bankAccounts,
  bankConnections,
  auditLog,
  productFeedback,
  rules,
} from "@/db";
import { getOrCreateUser } from "@/lib/user";

export const dynamic = "force-dynamic";

// Full data export — "users own their data" pillar. JSON of everything
// belonging to the requesting user; encrypted secrets are never included.
export async function GET() {
  const user = await getOrCreateUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [txns, accounts, connections, audits, feedback, personalRules] =
    await Promise.all([
      db.query.transactions.findMany({
        where: eq(transactions.userId, user.id),
      }),
      db.query.bankAccounts.findMany({
        where: eq(bankAccounts.userId, user.id),
      }),
      db.query.bankConnections.findMany({
        where: eq(bankConnections.userId, user.id),
      }),
      db.query.auditLog.findMany({ where: eq(auditLog.userId, user.id) }),
      db.query.productFeedback.findMany({
        where: eq(productFeedback.userId, user.id),
      }),
      db.query.rules.findMany({ where: eq(rules.userId, user.id) }),
    ]);

  const { slackBotTokenEncrypted, ...safeUser } = user;

  const body = {
    exportedAt: new Date().toISOString(),
    user: safeUser,
    transactions: txns,
    bankAccounts: accounts,
    bankConnections: connections.map(
      ({ accessTokenEncrypted, ...safe }) => safe
    ),
    rules: personalRules,
    auditLog: audits,
    productFeedback: feedback,
  };

  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="listero-export.json"',
    },
  });
}
