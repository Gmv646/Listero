import { eq } from "drizzle-orm";
import { db, auditLog, rules, transactions, type Rule } from "@/db";
import { ruleMatches } from "@/lib/categorization/rules";
import { track } from "@/lib/analytics";

// Personal vendor rules — ONE system with two entry points: the Vendor
// Rules page (proactive) and "Listero learned something" offers (reactive).
// Always layer='personal', always scoped to one user_id; never global.

export function normalizePattern(vendor: string): string {
  return vendor.toLowerCase().trim().slice(0, 80);
}

// Count how many of the user's transactions a rule pattern touches
export async function countAffected(
  userId: string,
  merchantPattern: string
): Promise<number> {
  const txs = await db.query.transactions.findMany({
    where: eq(transactions.userId, userId),
    limit: 2000,
  });
  return txs.filter((t) => ruleMatches({ merchantPattern }, t)).length;
}

// Retroactively apply a rule to every matching transaction (any status —
// the user asked for this vendor to ALWAYS be handled this way). Each
// change is audit-logged. Status becomes 'auto' (rule-handled, still
// overridable) unless it was already confirmed with the same values.
export async function applyRuleRetroactively(
  userId: string,
  rule: Pick<Rule, "merchantPattern" | "category" | "businessPersonal">
): Promise<number> {
  const txs = await db.query.transactions.findMany({
    where: eq(transactions.userId, userId),
    limit: 2000,
  });
  let changed = 0;
  for (const t of txs) {
    if (!ruleMatches(rule, t)) continue;
    if (
      t.category === rule.category &&
      t.businessPersonal === rule.businessPersonal
    ) {
      continue;
    }
    const before = {
      category: t.category,
      businessPersonal: t.businessPersonal,
      status: t.status,
    };
    await db
      .update(transactions)
      .set({
        category: rule.category,
        businessPersonal: rule.businessPersonal,
        status: t.status === "confirmed" ? "confirmed" : "auto",
        confidence: "0.95",
        reasoning: `Auto-categorized: matched your vendor rule for "${rule.merchantPattern}".`,
      })
      .where(eq(transactions.id, t.id));
    await db.insert(auditLog).values({
      userId,
      transactionId: t.id,
      action: "rule_reclassify",
      before,
      after: {
        category: rule.category,
        businessPersonal: rule.businessPersonal,
      },
      source: "web",
    });
    changed++;
  }
  await track({
    userId,
    eventType: "user_action_taken",
    action: "vendor_rule_retro_apply",
    metadata: { pattern: rule.merchantPattern, changed },
  });
  return changed;
}

// When a rule is removed: send its auto-handled transactions back to the
// review queue (proposal kept, user decides). Confirmed rows untouched.
export async function resetAutoForPattern(
  userId: string,
  merchantPattern: string
): Promise<number> {
  const txs = await db.query.transactions.findMany({
    where: eq(transactions.userId, userId),
    limit: 2000,
  });
  let changed = 0;
  for (const t of txs) {
    if (t.status !== "auto") continue;
    if (!ruleMatches({ merchantPattern }, t)) continue;
    await db
      .update(transactions)
      .set({ status: "pending" })
      .where(eq(transactions.id, t.id));
    changed++;
  }
  return changed;
}

// Create-or-replace: one personal rule per pattern per user
export async function upsertPersonalRule(
  userId: string,
  pattern: string,
  category: string,
  businessPersonal: string
): Promise<Rule> {
  const existing = await db.query.rules.findMany({
    where: eq(rules.userId, userId),
  });
  for (const r of existing) {
    if (r.layer === "personal" && r.merchantPattern === pattern) {
      await db.delete(rules).where(eq(rules.id, r.id));
    }
  }
  const [rule] = await db
    .insert(rules)
    .values({
      userId,
      layer: "personal",
      merchantPattern: pattern,
      category,
      businessPersonal,
      confidence: "0.95",
    })
    .returning();
  return rule;
}
