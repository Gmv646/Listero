import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, transactions, users, type Transaction, type User } from "@/db";
import { verifySlackSignature } from "@/lib/slack/verify";
import { deliberate, type ThreadTurn } from "@/lib/slack/reasoning";
import { applyUserConfirmation } from "@/lib/confirm";
import { slackClientFor } from "@/lib/slack/messages";
import { decryptSecret } from "@/lib/crypto";
import { track } from "@/lib/analytics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

type SlackFile = {
  id?: string;
  name?: string;
  mimetype?: string;
  url_private?: string;
  permalink?: string;
};

// Reply-to-categorize grown into the tax-reasoning partner: natural-language
// replies AND receipt photos in a transaction's thread, workshopped across
// turns until a defensible treatment is finalized and saved.
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySlackSignature(rawBody, req.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    type?: string;
    challenge?: string;
    team_id?: string;
    event?: {
      type?: string;
      channel_type?: string;
      subtype?: string;
      bot_id?: string;
      user?: string;
      text?: string;
      channel?: string;
      thread_ts?: string;
      files?: SlackFile[];
    };
  };

  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }
  // Slack retries slow responses; the first delivery does the work
  if (req.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true });
  }

  const ev = payload.event;
  const allowedSubtype = !ev?.subtype || ev.subtype === "file_share";
  if (
    payload.type !== "event_callback" ||
    ev?.type !== "message" ||
    ev.channel_type !== "im" ||
    !allowedSubtype ||
    ev.bot_id ||
    !ev.user ||
    !ev.channel ||
    !ev.thread_ts ||
    (!ev.text && !ev.files?.length)
  ) {
    return NextResponse.json({ ok: true });
  }

  const owner = await db.query.users.findFirst({
    where: and(
      eq(users.slackTeamId, payload.team_id ?? ""),
      eq(users.slackUserId, ev.user)
    ),
  });
  if (!owner) return NextResponse.json({ ok: true });

  const tx = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.userId, owner.id),
      eq(transactions.slackChannelId, ev.channel),
      eq(transactions.slackMessageTs, ev.thread_ts)
    ),
  });
  if (!tx) return NextResponse.json({ ok: true });

  const client = slackClientFor(owner);
  const say = async (text: string) => {
    if (!client) return;
    try {
      await client.chat.postMessage({
        channel: ev.channel!,
        thread_ts: ev.thread_ts!,
        text,
      });
    } catch {
      /* best effort */
    }
  };

  try {
    // Receipt attached? Save its metadata against the transaction now —
    // the receipt is kept even if the conversation goes nowhere.
    const receipt = ev.files?.find((f) => IMAGE_TYPES.has(f.mimetype ?? ""));
    if (receipt) {
      await db
        .update(transactions)
        .set({
          receiptMeta: {
            fileId: receipt.id,
            name: receipt.name,
            permalink: receipt.permalink,
            mimetype: receipt.mimetype,
          },
        })
        .where(eq(transactions.id, tx.id));
    }

    const turns = await buildThreadTurns(owner, tx, ev, receipt ?? null);
    const result = await deliberate(owner, tx, turns);

    if (!result) {
      await say(
        "🤔 I couldn't work with that one. Tell me what this purchase was for, or use the buttons above."
      );
      return NextResponse.json({ ok: true });
    }

    if (result.mode === "continue") {
      await say(result.reply);
      await track({
        userId: owner.id,
        transactionId: tx.id,
        eventType: "user_action_taken",
        action: "reasoning_turn",
      });
      return NextResponse.json({ ok: true });
    }

    // Finalize: apply the confirmation + save the workshopped position
    await applyUserConfirmation(
      tx,
      owner,
      { category: result.category, businessPersonal: result.business_personal },
      "slack",
      "reasoning_finalize"
    );
    await db
      .update(transactions)
      .set({
        deductiblePct: String(Math.max(0, Math.min(100, result.deductible_pct))),
        cpaNarrative: result.narrative,
        positionConfidence: String(Math.max(0, Math.min(1, result.confidence))),
        cpaReviewReason: result.needs_cpa_review ? result.cpa_review_reason : null,
        ...(result.note ? { userNote: result.note } : {}),
      })
      .where(eq(transactions.id, tx.id));

    const confPct = Math.round(result.confidence * 100);
    await say(
      `${result.reply}\n\n📋 Saved: *${result.category}* · ${Math.round(result.deductible_pct)}% deductible · confidence ${confPct}%${
        result.needs_cpa_review
          ? `\n🚩 Flagged for your CPA: ${result.cpa_review_reason} (it'll be marked in your export)`
          : ""
      }${receipt ? "\n🧾 Receipt attached to this transaction." : ""}`
    );
    await track({
      userId: owner.id,
      transactionId: tx.id,
      eventType: "user_action_taken",
      action: "reasoning_finalize",
      confidence: result.confidence,
      metadata: { needsCpa: result.needs_cpa_review, hasReceipt: Boolean(receipt) },
    });
  } catch (err) {
    console.error("reasoning partner failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    await say("⚠️ Something hiccuped on my end — the buttons above still work.");
  }

  return NextResponse.json({ ok: true });
}

// Rebuild the conversation from the Slack thread (bot turns + user turns),
// attaching the current message's receipt image for vision.
async function buildThreadTurns(
  owner: User,
  tx: Transaction,
  ev: { channel?: string; thread_ts?: string; text?: string; user?: string },
  receipt: SlackFile | null
): Promise<ThreadTurn[]> {
  const turns: ThreadTurn[] = [];
  const client = slackClientFor(owner);

  if (client && ev.channel && ev.thread_ts) {
    try {
      const replies = await client.conversations.replies({
        channel: ev.channel,
        ts: ev.thread_ts,
        limit: 20,
      });
      for (const m of replies.messages ?? []) {
        if (m.ts === ev.thread_ts) continue; // the transaction card itself is in context
        const text = (m.text ?? "").slice(0, 1500);
        if (!text && !m.files?.length) continue;
        turns.push({ role: m.bot_id ? "assistant" : "user", text });
      }
    } catch {
      /* thread fetch is best-effort; fall back to just this message */
    }
  }

  // Ensure the current message is the last user turn, with its image
  const last = turns[turns.length - 1];
  const currentText = (ev.text ?? "").slice(0, 1500);
  if (!last || last.role !== "user" || last.text !== currentText) {
    turns.push({ role: "user", text: currentText });
  }
  if (receipt?.url_private && owner.slackBotTokenEncrypted) {
    try {
      const res = await fetch(receipt.url_private, {
        headers: {
          Authorization: `Bearer ${decryptSecret(owner.slackBotTokenEncrypted)}`,
        },
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 4_500_000) {
          const lastUser = [...turns].reverse().find((t) => t.role === "user");
          if (lastUser) {
            lastUser.image = {
              mediaType: receipt.mimetype ?? "image/jpeg",
              base64: buf.toString("base64"),
            };
          }
        }
      }
    } catch {
      /* vision is additive; text-only deliberation still works */
    }
  }
  return turns;
}
