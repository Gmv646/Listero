import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import {
  db,
  auditLog,
  productFeedback,
  transactions,
  users,
  type Transaction,
  type User,
} from "@/db";
import { verifySlackSignature } from "@/lib/slack/verify";
import {
  slackClientFor,
  updateTransactionMessage,
} from "@/lib/slack/messages";
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
  choice: { category: string | null; businessPersonal: string }
): Promise<void> {
  const before = {
    category: tx.category,
    businessPersonal: tx.businessPersonal,
    status: tx.status,
  };
  const after = {
    category: choice.category,
    businessPersonal: choice.businessPersonal,
    status: "confirmed",
  };

  await db
    .update(transactions)
    .set({
      category: choice.category,
      businessPersonal: choice.businessPersonal,
      status: "confirmed",
      confirmedAt: new Date(),
    })
    .where(eq(transactions.id, tx.id));

  const overrode =
    tx.category !== choice.category ||
    tx.businessPersonal !== choice.businessPersonal;

  // Overrides are logged distinctly — this delta feeds confidence calibration
  await db.insert(auditLog).values({
    userId: owner.id,
    transactionId: tx.id,
    action: overrode ? "user_override" : "user_confirm",
    before,
    after,
    source: "slack",
  });

  const label =
    choice.businessPersonal === "personal"
      ? "Personal"
      : `Business · ${choice.category ?? "Uncategorized"}`;
  await updateTransactionMessage(
    owner,
    { ...tx, ...{ category: choice.category, businessPersonal: choice.businessPersonal } },
    `✅ Confirmed as *${label}*`
  );
}

async function handleBlockActions(payload: BlockActionsPayload) {
  const action = payload.actions?.[0];
  const loaded = await loadAuthorized(action?.value, payload);
  if (!loaded) return NextResponse.json({});
  const { tx, owner } = loaded;

  switch (action.action_id) {
    case "confirm_business":
      await confirmTransaction(tx, owner, {
        category: tx.category ?? "Other",
        businessPersonal: "business",
      });
      break;

    case "confirm_personal":
      await confirmTransaction(tx, owner, {
        category: "Personal",
        businessPersonal: "personal",
      });
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
    await confirmTransaction(tx, owner, { category, businessPersonal });
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
