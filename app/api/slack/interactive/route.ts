import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import {
  db,
  productFeedback,
  rules,
  transactions,
  users,
  type Transaction,
  type User,
} from "@/db";
import { track } from "@/lib/analytics";
import { verifySlackSignature } from "@/lib/slack/verify";
import { applyUserConfirmation } from "@/lib/confirm";
import { slackClientFor } from "@/lib/slack/messages";
import { CATEGORIES, DISCLAIMER, TAX_EXPLANATIONS } from "@/lib/categories";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type BlockActionsPayload = {
  type: "block_actions";
  trigger_id: string;
  team?: { id?: string };
  user?: { id?: string };
  actions: Array<{ action_id: string; value?: string }>;
};

type ViewSubmissionPayload = {
  type: "view_submission";
  team?: { id?: string };
  user?: { id?: string };
  view: {
    callback_id: string;
    private_metadata: string;
    state: {
      values: Record<
        string,
        Record<
          string,
          {
            type: string;
            value?: string | null;
            selected_option?: { value: string } | null;
          }
        >
      >;
    };
  };
};

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifySlackSignature(rawBody, req.headers)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payloadStr = new URLSearchParams(rawBody).get("payload");
  if (!payloadStr) return NextResponse.json({}, { status: 400 });
  const payload = JSON.parse(payloadStr) as
    | BlockActionsPayload
    | ViewSubmissionPayload;

  if (payload.type === "block_actions") {
    return handleBlockActions(payload);
  }
  if (payload.type === "view_submission") {
    return handleViewSubmission(payload);
  }
  return NextResponse.json({});
}

// Load the transaction referenced by a button and its owning user, and check
// the click came from that user's own Slack identity/workspace.
async function loadAuthorized(
  txId: string | undefined,
  payload: { team?: { id?: string }; user?: { id?: string } }
): Promise<{ tx: Transaction; owner: User } | null> {
  if (!txId) return null;
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, txId),
  });
  if (!tx?.userId) return null;
  const owner = await db.query.users.findFirst({
    where: eq(users.id, tx.userId),
  });
  if (!owner) return null;
  if (
    owner.slackTeamId !== payload.team?.id ||
    owner.slackUserId !== payload.user?.id
  ) {
    return null;
  }
  return { tx, owner };
}

async function confirmTransaction(
  tx: Transaction,
  owner: User,
  choice: { category: string | null; businessPersonal: string },
  actionId: string
): Promise<void> {
  await applyUserConfirmation(tx, owner, choice, "slack", actionId);
}

async function handleBlockActions(payload: BlockActionsPayload) {
  const action = payload.actions?.[0];

  // Rule offers carry a JSON value (merchant/category), not a transaction id
  if (
    action?.action_id === "rule_accept" ||
    action?.action_id === "rule_decline"
  ) {
    return handleRuleOffer(payload, action);
  }

  const loaded = await loadAuthorized(action?.value, payload);
  if (!loaded) return NextResponse.json({});
  const { tx, owner } = loaded;

  switch (action.action_id) {
    case "confirm_business":
      await confirmTransaction(
        tx,
        owner,
        { category: tx.category ?? "Other", businessPersonal: "business" },
        "confirm_business"
      );
      break;

    case "confirm_personal":
      await confirmTransaction(
        tx,
        owner,
        { category: "Personal", businessPersonal: "personal" },
        "confirm_personal"
      );
      break;

    case "wrong_category": {
      const client = slackClientFor(owner);
      if (!client) break;
      await client.views.open({
        trigger_id: payload.trigger_id,
        view: {
          type: "modal",
          callback_id: "wrong_category_modal",
          private_metadata: tx.id,
          title: { type: "plain_text", text: "Fix the category" },
          submit: { type: "plain_text", text: "Save" },
          blocks: [
            {
              type: "input",
              block_id: "category",
              label: { type: "plain_text", text: "Correct category" },
              element: {
                type: "static_select",
                action_id: "value",
                options: CATEGORIES.map((c) => ({
                  text: { type: "plain_text" as const, text: c },
                  value: c,
                })),
              },
            },
            {
              type: "input",
              block_id: "business_personal",
              label: { type: "plain_text", text: "Business or personal?" },
              element: {
                type: "static_select",
                action_id: "value",
                options: [
                  {
                    text: { type: "plain_text" as const, text: "Business" },
                    value: "business",
                  },
                  {
                    text: { type: "plain_text" as const, text: "Personal" },
                    value: "personal",
                  },
                  {
                    text: {
                      type: "plain_text" as const,
                      text: "Internal transfer (not real spend)",
                    },
                    value: "internal",
                  },
                ],
              },
            },
          ],
        },
      });
      break;
    }

    case "explain_tax": {
      const client = slackClientFor(owner);
      if (!client || !tx.slackChannelId || !tx.slackMessageTs) break;
      const explanation =
        TAX_EXPLANATIONS[tx.category ?? ""] ??
        "This one doesn't map to a standard tax rule yet. If it's an ordinary and necessary expense for running your business, it's likely deductible — flag it for your tax professional.";
      await client.chat.postMessage({
        channel: tx.slackChannelId,
        thread_ts: tx.slackMessageTs,
        text: `💡 ${explanation}\n\n_${DISCLAIMER}_`,
      });
      break;
    }

    case "give_feedback": {
      const client = slackClientFor(owner);
      if (!client) break;
      await client.views.open({
        trigger_id: payload.trigger_id,
        view: {
          type: "modal",
          callback_id: "feedback_modal",
          private_metadata: tx.id,
          title: { type: "plain_text", text: "Help Listero improve" },
          submit: { type: "plain_text", text: "Send" },
          blocks: [
            {
              type: "input",
              block_id: "feedback",
              label: {
                type: "plain_text",
                text: "What do you wish Listero had done differently?",
              },
              element: {
                type: "plain_text_input",
                action_id: "value",
                multiline: true,
              },
            },
          ],
        },
      });
      break;
    }
  }

  return NextResponse.json({});
}

async function handleRuleOffer(
  payload: BlockActionsPayload,
  action: { action_id: string; value?: string }
) {
  const owner = await db.query.users.findFirst({
    where: and(
      eq(users.slackTeamId, payload.team?.id ?? ""),
      eq(users.slackUserId, payload.user?.id ?? "")
    ),
  });
  if (!owner || !action.value) return NextResponse.json({});

  let offer: { m: string; c: string; b: string };
  try {
    offer = JSON.parse(action.value);
  } catch {
    return NextResponse.json({});
  }

  const accepted = action.action_id === "rule_accept";
  if (accepted) {
    await db.insert(rules).values({
      userId: owner.id,
      layer: "personal",
      merchantPattern: offer.m,
      category: offer.c,
      businessPersonal: offer.b,
      confidence: "0.95",
    });
  }
  await track({
    userId: owner.id,
    eventType: "user_action_taken",
    action: accepted ? "rule_offer_accepted" : "rule_offer_declined",
    metadata: { merchant: offer.m, category: offer.c },
  });

  // Rewrite the offer message with the outcome
  const client = slackClientFor(owner);
  const container = (
    payload as unknown as {
      container?: { channel_id?: string; message_ts?: string };
    }
  ).container;
  if (client && container?.channel_id && container.message_ts) {
    const text = accepted
      ? `✅ Got it — I'll auto-handle *${offer.m}* as *${offer.b === "personal" ? "Personal" : `Business · ${offer.c}`}* from now on. You'll still see each one; change it anytime by tapping its buttons.`
      : `👍 No problem — I'll keep asking about *${offer.m}*.`;
    try {
      await client.chat.update({
        channel: container.channel_id,
        ts: container.message_ts,
        text,
        blocks: [
          { type: "section", text: { type: "mrkdwn", text } },
        ],
      });
    } catch {
      /* best effort */
    }
  }
  return NextResponse.json({});
}

async function handleViewSubmission(payload: ViewSubmissionPayload) {
  const txId = payload.view.private_metadata;
  const loaded = await loadAuthorized(txId, payload);
  if (!loaded) return NextResponse.json({});
  const { tx, owner } = loaded;
  const values = payload.view.state.values;

  if (payload.view.callback_id === "wrong_category_modal") {
    const category = values.category?.value?.selected_option?.value ?? null;
    const businessPersonal =
      values.business_personal?.value?.selected_option?.value ?? "business";
    await confirmTransaction(
      tx,
      owner,
      { category, businessPersonal },
      "wrong_category"
    );
  }

  if (payload.view.callback_id === "feedback_modal") {
    const text = values.feedback?.value?.value?.trim();
    if (text) {
      await db.insert(productFeedback).values({
        userId: owner.id,
        transactionId: tx.id,
        feedbackText: text,
      });
      const client = slackClientFor(owner);
      if (client && tx.slackChannelId && tx.slackMessageTs) {
        await client.chat.postMessage({
          channel: tx.slackChannelId,
          thread_ts: tx.slackMessageTs,
          text: "🙏 Thanks — logged. Feedback like this directly shapes what gets built next.",
        });
      }
    }
  }

  // Empty 200 closes the modal
  return NextResponse.json({});
}
