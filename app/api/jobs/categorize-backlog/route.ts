import { NextResponse } from "next/server";
import { and, eq, isNull, ne, or, desc, count } from "drizzle-orm";
import { db, transactions } from "@/db";
import { getOrCreateUser } from "@/lib/user";
import { onNewTransactions } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bounded backlog categorization: processes a small batch of the user's
// uncategorized, unarchived pending transactions through the full pipeline
// (Claude included, no Slack pings) and reports how many remain. The client
// loops this endpoint with a progress UI — serverless-timeout-safe no matter
// how large the backlog is.
const BATCH_SIZE = 8;

export async function POST() {
  const user = await getOrCreateUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uncategorized = and(
    eq(transactions.userId, user.id),
    eq(transactions.status, "pending"),
    eq(transactions.archived, false),
    isNull(transactions.category),
    // NULL-safe: uncategorized rows usually have NULL business_personal
    or(
      isNull(transactions.businessPersonal),
      ne(transactions.businessPersonal, "internal")
    )
  );

  const batch = await db.query.transactions.findMany({
    where: uncategorized,
    orderBy: [desc(transactions.date)], // most recent first — most useful
    limit: BATCH_SIZE,
  });

  if (batch.length > 0) {
    await onNewTransactions(
      user.id,
      batch.map((t) => t.id),
      { notify: false, allowClaude: true }
    );
  }

  const [{ value: remaining }] = await db
    .select({ value: count() })
    .from(transactions)
    .where(uncategorized);

  return NextResponse.json({ processed: batch.length, remaining });
}
