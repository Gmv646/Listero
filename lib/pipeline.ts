import { eq } from "drizzle-orm";
import { db, transactions, users, type Transaction, type User } from "@/db";
import { matchRules, ruleSourceDescription } from "@/lib/categorization/rules";
import { proposeCategorization } from "@/lib/categorization/claude";
import {
  findTransferPair,
  findRefundOrigin,
  plaidTransferSignal,
  markInternalTransfer,
  INTERNAL_CATEGORY,
} from "@/lib/categorization/transfers";
import { sendTransactionMessage } from "@/lib/slack/messages";
import { track } from "@/lib/analytics";

export interface PipelineOptions {
  // false when backfilling/reprocessing: no Slack DMs
  notify?: boolean;
  // false when reprocessing: only deterministic fixes, no AI spend
  allowClaude?: boolean;
}

// Classification order (all layers fully generic, per multi-tenant rule):
//   1. Cross-account transfer pair (both legs → internal, nets to zero)
//   2. Bank-provided transfer/card-payment signal (Plaid PFC)
//   3. Inflows: transfer-pattern rule → refund heuristic → propose revenue.
//      Incoming money is never left uncategorized.
//   4. Outflows: rules (personal → industry → global) → Claude proposal.
// Auto-applied results are never silent: the processed leg still pings Slack.
export async function onNewTransactions(
  userId: string,
  transactionIds: string[],
  opts: PipelineOptions = {}
): Promise<void> {
  const { notify = true, allowClaude = true } = opts;
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return;

  for (const txId of transactionIds) {
    try {
      await processTransaction(user, txId, { notify, allowClaude });
    } catch (err) {
      // One bad transaction must not block the rest of the batch
      console.error("pipeline: transaction failed", {
        txId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function processTransaction(
  user: User,
  txId: string,
  opts: Required<PipelineOptions>
): Promise<void> {
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, txId),
  });
  if (!tx || tx.status === "confirmed") return;
  // Already resolved as a transfer (e.g. the partner leg processed first)
  if (tx.category === INTERNAL_CATEGORY) return;

  // 1. Cross-account pair
  const pair = await findTransferPair(tx);
  if (pair) {
    const describe = (other: Transaction) =>
      `This ${tx.direction === "outflow" ? "payment" : "deposit"} matches a ${
        other.direction === "inflow" ? "deposit into" : "withdrawal from"
      } another of your connected accounts for the same amount on ${other.date}. ` +
      `Money moving between your own accounts nets to zero — it's neither spend nor income.`;
    await markInternalTransfer(tx.id, describe(pair));
    await markInternalTransfer(
      pair.id,
      `Matched as the other leg of a transfer between your own accounts (${tx.date}). Nets to zero.`
    );
    await track({
      userId: user.id,
      transactionId: tx.id,
      eventType: "categorization_completed",
      method: "pair_match",
      confidence: 0.9,
    });
    await maybeNotify(user, tx.id, opts.notify);
    return;
  }

  // 2. Bank-provided signal
  const signal = plaidTransferSignal(tx);
  if (signal) {
    await markInternalTransfer(
      tx.id,
      signal === "card-payment"
        ? "Your bank's transaction data marks this as a credit-card payment. Paying your own card isn't spend — the individual card purchases are what count."
        : "Your bank's transaction data marks this as a transfer between accounts. Transfers net to zero — neither spend nor income."
    );
    await track({
      userId: user.id,
      transactionId: tx.id,
      eventType: "categorization_completed",
      method: "plaid_signal",
      confidence: 0.9,
    });
    await maybeNotify(user, tx.id, opts.notify);
    return;
  }

  const { match, hints } = await matchRules(user, tx);

  // 3. Inflows are always classified — never silently uncategorized
  if (tx.direction === "inflow") {
    if (match && match.businessPersonal === "internal") {
      await markInternalTransfer(
        tx.id,
        `Auto-categorized: ${ruleSourceDescription(match)}. Transfers net to zero — neither spend nor income.`
      );
      await track({
        userId: user.id,
        transactionId: tx.id,
        eventType: "categorization_completed",
        method: "rule",
        confidence: match.confidence,
      });
      await maybeNotify(user, tx.id, opts.notify);
      return;
    }

    const refundOrigin = await findRefundOrigin(tx);
    if (refundOrigin) {
      await db
        .update(transactions)
        .set({
          category: "Refund",
          businessPersonal: refundOrigin.businessPersonal ?? "business",
          confidence: "0.7",
          reasoning: `This credit matches your ${refundOrigin.merchantDisplay ?? refundOrigin.merchantRaw} purchase of $${refundOrigin.amount} on ${refundOrigin.date} — it looks like a refund, not new income. Confirm below.`,
          // stays 'pending' — user confirms
        })
        .where(eq(transactions.id, tx.id));
    } else {
      await db
        .update(transactions)
        .set({
          category: "Income",
          businessPersonal: "business",
          confidence: "0.6",
          reasoning:
            "Money in that doesn't match a transfer between your accounts or a recent refund — most likely client revenue. Confirm below so your income numbers stay accurate.",
          // stays 'pending' — user confirms
        })
        .where(eq(transactions.id, tx.id));
    }
    await track({
      userId: user.id,
      transactionId: tx.id,
      eventType: "categorization_completed",
      method: refundOrigin ? "refund_heuristic" : "inflow_default",
      confidence: refundOrigin ? 0.7 : 0.6,
    });
    await maybeNotify(user, tx.id, opts.notify);
    return;
  }

  // 4. Outflows: rules first, then Claude
  if (match) {
    const isInternal = match.businessPersonal === "internal";
    await db
      .update(transactions)
      .set({
        category: match.category,
        businessPersonal: match.businessPersonal,
        confidence: match.confidence,
        reasoning: isInternal
          ? `Auto-categorized: ${ruleSourceDescription(match)}. Transfers net to zero — neither spend nor income.`
          : `Auto-categorized: ${ruleSourceDescription(match)}. Tap a button to confirm or change it.`,
        status: "auto",
      })
      .where(eq(transactions.id, tx.id));
    await track({
      userId: user.id,
      transactionId: tx.id,
      eventType: "categorization_completed",
      method: "rule",
      confidence: match.confidence,
    });
  } else if (opts.allowClaude) {
    const result = await proposeCategorization(user, tx, hints);
    if (result) {
      await db
        .update(transactions)
        .set({
          category: result.proposal.category,
          businessPersonal: result.proposal.business_personal,
          confidence: String(result.proposal.confidence),
          reasoning: result.proposal.reasoning,
          // still 'pending' — AI proposes, user disposes
        })
        .where(eq(transactions.id, tx.id));
      await track({
        userId: user.id,
        transactionId: tx.id,
        eventType: "categorization_completed",
        method: "claude",
        model: result.model,
        confidence: result.proposal.confidence,
      });
    }
  } else {
    return; // reprocess mode: leave non-transfer outflows untouched
  }

  await maybeNotify(user, tx.id, opts.notify);
}

async function maybeNotify(user: User, txId: string, notify: boolean) {
  if (!notify) return;
  if (!user.slackTeamId || !user.slackUserId || !user.slackBotTokenEncrypted) {
    return;
  }
  const fresh = await db.query.transactions.findFirst({
    where: eq(transactions.id, txId),
  });
  if (fresh) {
    const sent = await sendTransactionMessage(user, fresh);
    if (sent) {
      await track({
        userId: user.id,
        transactionId: txId,
        eventType: "slack_dm_sent",
      });
    }
  }
}
