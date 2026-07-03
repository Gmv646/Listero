import { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/web-api";
import { eq } from "drizzle-orm";
import { db, transactions, type Transaction, type User } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { SHORT_HINTS } from "@/lib/categories";

export function slackClientFor(user: User): WebClient | null {
  if (!user.slackBotTokenEncrypted) return null;
  return new WebClient(decryptSecret(user.slackBotTokenEncrypted));
}

function money(tx: Transaction): string {
  const sign = tx.direction === "inflow" ? "+" : "";
  return `${sign}$${tx.amount}`;
}

function when(tx: Transaction): string {
  const created = tx.createdAt ? new Date(tx.createdAt).getTime() : 0;
  if (Date.now() - created < 10 * 60 * 1000) return "Just now";
  return tx.date;
}

// Canonical transaction message. `state` controls whether the action buttons
// are shown or replaced with the confirmed summary.
export function buildTransactionBlocks(
  tx: Transaction,
  opts?: { confirmedSummary?: string }
): KnownBlock[] {
  const merchant = tx.merchantDisplay ?? tx.merchantRaw ?? "Unknown merchant";
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${merchant}* — ${money(tx)} — ${when(tx)}`,
      },
    },
  ];

  if (tx.category) {
    const hint = SHORT_HINTS[tx.category] ?? "";
    let line: string;
    if (tx.businessPersonal === "internal") {
      line = `🔁 *Internal transfer* — nets to zero (not spend or income)`;
    } else if (tx.businessPersonal === "personal") {
      line = `🏠 *Personal* — ${hint || "not a business expense"}`;
    } else {
      line = `💼 *${tx.category}*${hint ? ` — ${hint}` : ""}`;
    }
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: line },
    });
  }

  if (tx.reasoning) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `_Reasoning: ${tx.reasoning}_` },
    });
  }

  if (opts?.confirmedSummary) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: opts.confirmedSummary }],
    });
    return blocks;
  }

  blocks.push(
    {
      type: "actions",
      block_id: "tx_actions",
      elements: [
        {
          type: "button",
          style: "primary",
          text: { type: "plain_text", text: "✓ Confirm Business" },
          action_id: "confirm_business",
          value: tx.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Personal" },
          action_id: "confirm_personal",
          value: tx.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Wrong category" },
          action_id: "wrong_category",
          value: tx.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "What does this mean?" },
          action_id: "explain_tax",
          value: tx.id,
        },
      ],
    },
    {
      type: "actions",
      block_id: "tx_feedback",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "📝 Tell me what you wish I'd done differently",
          },
          action_id: "give_feedback",
          value: tx.id,
        },
      ],
    }
  );

  return blocks;
}

// DM the user about a transaction and record the message coordinates so
// button clicks can rewrite it later.
export async function sendTransactionMessage(
  user: User,
  tx: Transaction
): Promise<boolean> {
  const client = slackClientFor(user);
  if (!client || !user.slackUserId) return false;

  const dm = await client.conversations.open({ users: user.slackUserId });
  const channelId = dm.channel?.id;
  if (!channelId) return false;

  const merchant = tx.merchantDisplay ?? tx.merchantRaw ?? "a merchant";
  const posted = await client.chat.postMessage({
    channel: channelId,
    text: `New purchase: ${merchant} ${money(tx)}`,
    blocks: buildTransactionBlocks(tx),
  });

  if (posted.ts) {
    await db
      .update(transactions)
      .set({ slackMessageTs: posted.ts, slackChannelId: channelId })
      .where(eq(transactions.id, tx.id));
  }
  return Boolean(posted.ts);
}

export async function updateTransactionMessage(
  user: User,
  tx: Transaction,
  confirmedSummary: string
): Promise<void> {
  const client = slackClientFor(user);
  if (!client || !tx.slackChannelId || !tx.slackMessageTs) return;

  const merchant = tx.merchantDisplay ?? tx.merchantRaw ?? "a merchant";
  await client.chat.update({
    channel: tx.slackChannelId,
    ts: tx.slackMessageTs,
    text: `${merchant} ${money(tx)} — ${confirmedSummary}`,
    blocks: buildTransactionBlocks(tx, { confirmedSummary }),
  });
}
