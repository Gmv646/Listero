import { db, productAnalytics } from "@/db";

export type AnalyticsEvent = {
  userId: string;
  transactionId?: string | null;
  eventType:
    | "plaid_webhook_received"
    | "categorization_completed"
    | "slack_dm_sent"
    | "user_action_taken";
  method?: string;
  model?: string;
  confidence?: number | string | null;
  action?: string;
  matchedProposal?: boolean;
  metadata?: Record<string, unknown>;
};

// Fire-and-forget product telemetry. Must never break the calling flow —
// a lost analytics row is fine, a lost Slack ping is not.
export async function track(ev: AnalyticsEvent): Promise<void> {
  try {
    await db.insert(productAnalytics).values({
      userId: ev.userId,
      transactionId: ev.transactionId ?? null,
      eventType: ev.eventType,
      method: ev.method ?? null,
      model: ev.model ?? null,
      confidence: ev.confidence != null ? String(ev.confidence) : null,
      action: ev.action ?? null,
      matchedProposal: ev.matchedProposal ?? null,
      metadata: ev.metadata ?? null,
    });
  } catch (err) {
    console.warn("analytics dropped", {
      eventType: ev.eventType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
