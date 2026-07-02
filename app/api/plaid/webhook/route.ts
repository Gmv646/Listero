import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, bankConnections, users } from "@/db";
import { getBankProvider } from "@/lib/bank-provider";
import { markConnectionLost, syncConnection } from "@/lib/bank-provider/sync";
import { onNewTransactions } from "@/lib/pipeline";
import { slackClientFor } from "@/lib/slack/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const provider = getBankProvider();

  const verified = await provider.verifyWebhook(rawBody, req.headers);
  if (!verified) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = provider.parseWebhookEvent(payload);
  if (event.kind === "ignore") {
    return NextResponse.json({ ok: true, ignored: event.reason });
  }

  const conn = await db.query.bankConnections.findFirst({
    where: eq(bankConnections.externalEnrollmentId, event.itemId),
  });
  if (!conn) {
    // Unknown item — acknowledge so the provider stops retrying
    console.warn("webhook for unknown item", { itemId: event.itemId });
    return NextResponse.json({ ok: true });
  }

  if (event.kind === "connection-lost") {
    const alreadyLost = conn.status !== "active";
    await markConnectionLost(conn.id);
    // Tell the user their bank needs reconnecting (once, via Slack DM)
    if (!alreadyLost && conn.userId) {
      const owner = await db.query.users.findFirst({
        where: eq(users.id, conn.userId),
      });
      const client = owner ? slackClientFor(owner) : null;
      if (client && owner?.slackUserId) {
        try {
          const dm = await client.conversations.open({
            users: owner.slackUserId,
          });
          if (dm.channel?.id) {
            await client.chat.postMessage({
              channel: dm.channel.id,
              text: `⚠️ Listero lost the connection to ${conn.institutionName ?? "your bank"}. New purchases won't come through until you reconnect: ${process.env.NEXT_PUBLIC_APP_URL}/settings`,
            });
          }
        } catch (err) {
          console.warn("reconnect DM failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    return NextResponse.json({ ok: true });
  }

  const { insertedTxIds } = await syncConnection(conn.id);
  if (insertedTxIds.length > 0 && conn.userId) {
    await onNewTransactions(conn.userId, insertedTxIds);
  }

  return NextResponse.json({ ok: true, newTransactions: insertedTxIds.length });
}
