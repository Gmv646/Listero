import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, transactions, users } from "@/db";
import { verifySlackSignature } from "@/lib/slack/verify";
import { parseReply } from "@/lib/slack/reply-parse";
import { applyUserConfirmation } from "@/lib/confirm";
import { slackClientFor } from "@/lib/slack/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Slack Events API: reply-to-categorize. A natural-language reply in a
// transaction DM thread ("that was gear for the Henderson shoot") is parsed
// into a categorization + note + optional rule suggestion.
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
    };
  };

  // Slack's endpoint handshake
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Slack retries when we're slow; first delivery does the work
  if (req.headers.get("x-slack-retry-num")) {
    return NextResponse.json({ ok: true });
  }

  const ev = payload.event;
  // Only human messages, in DMs, threaded under one of our transaction posts
  if (
    payload.type !== "event_callback" ||
    ev?.type !== "message" ||
    ev.channel_type !== "im" ||
    ev.subtype ||
    ev.bot_id ||
    !ev.user ||
    !ev.text ||
    !ev.channel ||
    !ev.thread_ts
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
  const reply = async (text: string) => {
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
    const parsed = await parseReply(owner, tx, ev.text);
    if (!parsed || !parsed.understood) {
      await reply(
        "🤔 I couldn't turn that into a categorization. Try something like “business — camera gear for a client shoot”, or use the buttons above."
      );
      return NextResponse.json({ ok: true });
    }

    await applyUserConfirmation(
      tx,
      owner,
      { category: parsed.category, businessPersonal: parsed.business_personal },
      "slack",
      "reply_categorize"
    );
    if (parsed.note) {
      await db
        .update(transactions)
        .set({ userNote: parsed.note })
        .where(eq(transactions.id, tx.id));
    }

    let ruleLine = "";
    if (parsed.suggest_rule) {
      const merchant = (tx.merchantDisplay ?? tx.merchantRaw ?? "")
        .toLowerCase()
        .slice(0, 60)
        .trim();
      if (merchant) {
        const { rules } = await import("@/db");
        await db.insert(rules).values({
          userId: owner.id,
          layer: "personal",
          merchantPattern: merchant,
          category: parsed.category,
          businessPersonal: parsed.business_personal,
          confidence: "0.95",
        });
        ruleLine = ` From now on I'll auto-handle ${tx.merchantDisplay ?? "this merchant"} the same way.`;
      }
    }

    await reply(
      `${parsed.acknowledgement}${parsed.note ? ` 📝 Noted: “${parsed.note}”.` : ""}${ruleLine}`
    );
  } catch (err) {
    console.error("reply-categorize failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    await reply("⚠️ Something hiccuped on my end — the buttons above still work.");
  }

  return NextResponse.json({ ok: true });
}
