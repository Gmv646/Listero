import { eq } from "drizzle-orm";
import { db, auditLog, transactions, type Transaction, type User } from "@/db";
import { updateTransactionMessage } from "@/lib/slack/messages";
import { track } from "@/lib/analytics";

// Single confirmation path shared by the Slack interactivity endpoint and
// the web review flow — identical DB update, audit trail, analytics, and
// Slack message rewrite regardless of where the user tapped.
export async function applyUserConfirmation(
  tx: Transaction,
  owner: User,
  choice: { category: string | null; businessPersonal: string },
  source: "slack" | "web",
  actionId: string
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
    source,
  });

  await track({
    userId: owner.id,
    transactionId: tx.id,
    eventType: "user_action_taken",
    action: actionId,
    matchedProposal: !overrode,
    metadata: { fromCategory: tx.category, toCategory: choice.category, source },
  });

  // Keep the Slack message in sync even when confirmed from the web
  const label = confirmationLabel(choice);
  await updateTransactionMessage(
    owner,
    { ...tx, category: choice.category, businessPersonal: choice.businessPersonal },
    `✅ Confirmed as *${label}*`
  );
}

export function confirmationLabel(choice: {
  category: string | null;
  businessPersonal: string;
}): string {
  if (choice.businessPersonal === "internal") {
    return "Internal transfer · nets to zero";
  }
  if (choice.businessPersonal === "personal") return "Personal";
  return `Business · ${choice.category ?? "Uncategorized"}`;
}
