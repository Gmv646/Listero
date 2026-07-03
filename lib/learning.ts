import { and, eq, sql } from "drizzle-orm";
import { db, rules, transactions, type Transaction, type User } from "@/db";
import { cleanMerchant } from "@/lib/display";
import { slackClientFor } from "@/lib/slack/messages";
import { track } from "@/lib/analytics";

// "Listero learned something": after 3 consistent confirmations of the same
// merchant → same category, offer one-tap auto-handling (a personal rule).
// Opt-in per the product pillar — never silently enabled. Generic for any
// user and any merchant.
const CONSISTENT_THRESHOLD = 3;

export async function maybeOfferRule(
  owner: User,
  tx: Transaction,
  choice: { category: string | null; businessPersonal: string }
): Promise<void> {
  try {
    if (!choice.category || choice.businessPersonal === "internal") return;
    if (!owner.slackTeamId || !owner.slackUserId || !owner.slackBotTokenEncrypted)
      return;
    const merchant = cleanMerchant(tx).toLowerCase();
    if (!merchant || merchant === "unknown merchant") return;

    // Already have a personal rule covering this merchant?
    const existing = await db.query.rules.findMany({
      where: and(eq(rules.userId, owner.id), eq(rules.layer, "personal")),
    });
    if (existing.some((r) => merchant.includes(r.merchantPattern.toLowerCase())))
      return;

    // Declined or offered recently? (recorded in analytics)
    const prior = await db.execute(sql`
      SELECT 1 FROM product_analytics
      WHERE user_id = ${owner.id}
        AND action IN ('rule_offer_sent', 'rule_offer_declined')
        AND metadata->>'merchant' = ${merchant}
        AND created_at > now() - interval '30 days'
      LIMIT 1
    `);
    if ((prior as unknown as unknown[]).length > 0) return;

    // Count consistent confirmations of this merchant → this exact choice
    const confirmed = await db.query.transactions.findMany({
      where: and(
        eq(transactions.userId, owner.id),
        eq(transactions.status, "confirmed"),
        eq(transactions.category, choice.category),
        eq(transactions.businessPersonal, choice.businessPersonal)
      ),
      limit: 200,
    });
    const consistent = confirmed.filter(
      (t) => cleanMerchant(t).toLowerCase() === merchant
    ).length;
    if (consistent < CONSISTENT_THRESHOLD) return;

    const client = slackClientFor(owner);
    if (!client) return;
    const dm = await client.conversations.open({ users: owner.slackUserId });
    if (!dm.channel?.id) return;

    const value = JSON.stringify({
      m: merchant,
      c: choice.category,
      b: choice.businessPersonal,
    });
    const label =
      choice.businessPersonal === "personal"
        ? "Personal"
        : `Business · ${choice.category}`;
    await client.chat.postMessage({
      channel: dm.channel.id,
      text: `Listero learned something: you've confirmed ${cleanMerchant(tx)} as ${label} ${consistent} times.`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `💡 *Listero learned something.* You've confirmed *${cleanMerchant(tx)}* as *${label}* ${consistent} times now. Want me to auto-handle it from here? (You'll still see each one — just no more asking.)`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              style: "primary",
              text: { type: "plain_text", text: "Yes, auto-handle it" },
              action_id: "rule_accept",
              value,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "No thanks" },
              action_id: "rule_decline",
              value,
            },
          ],
        },
      ],
    });

    await track({
      userId: owner.id,
      eventType: "user_action_taken",
      action: "rule_offer_sent",
      metadata: { merchant, category: choice.category },
    });
  } catch (err) {
    // Learning offers are strictly best-effort
    console.warn("rule offer skipped", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
