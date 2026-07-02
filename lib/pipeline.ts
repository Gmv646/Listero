import { eq } from "drizzle-orm";
import { db, transactions, users } from "@/db";
import { matchRules, ruleSourceDescription } from "@/lib/categorization/rules";
import { proposeCategorization } from "@/lib/categorization/claude";
import { sendTransactionMessage } from "@/lib/slack/messages";

// Categorization pipeline: rules first (personal → industry → global), Claude
// when no high-confidence rule matches. Every transaction gets a Slack ping —
// a rule auto-apply is status='auto', never silent (the user can override).
// Claude proposals stay status='pending' until the user confirms.
export async function onNewTransactions(
  userId: string,
  transactionIds: string[]
): Promise<void> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return;

  for (const txId of transactionIds) {
    try {
      await processTransaction(user, txId);
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
  user: NonNullable<Awaited<ReturnType<typeof db.query.users.findFirst>>>,
  txId: string
): Promise<void> {
  const tx = await db.query.transactions.findFirst({
    where: eq(transactions.id, txId),
  });
  if (!tx || tx.status === "confirmed") return;

  const { match, hints } = await matchRules(user, tx);

  if (match) {
    await db
      .update(transactions)
      .set({
        category: match.category,
        businessPersonal: match.businessPersonal,
        confidence: match.confidence,
        reasoning: `Auto-categorized: ${ruleSourceDescription(match)}. Tap a button to confirm or change it.`,
        status: "auto",
      })
      .where(eq(transactions.id, tx.id));
  } else {
    const proposal = await proposeCategorization(user, tx, hints);
    if (proposal) {
      await db
        .update(transactions)
        .set({
          category: proposal.category,
          businessPersonal: proposal.business_personal,
          confidence: String(proposal.confidence),
          reasoning: proposal.reasoning,
          // still 'pending' — AI proposes, user disposes
        })
        .where(eq(transactions.id, tx.id));
    }
  }

  // Slack ping — skipped gracefully when Slack isn't connected yet
  if (user.slackTeamId && user.slackUserId && user.slackBotTokenEncrypted) {
    const fresh = await db.query.transactions.findFirst({
      where: eq(transactions.id, tx.id),
    });
    if (fresh) await sendTransactionMessage(user, fresh);
  }
}
