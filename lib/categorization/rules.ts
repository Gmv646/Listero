import { and, eq, isNull } from "drizzle-orm";
import { db, rules, type Rule, type Transaction, type User } from "@/db";

// Rules matching: personal → industry → global, first high-confidence match
// wins. A rule matches when its merchant_pattern appears (case-insensitive)
// in the transaction's raw or display merchant string.

const AUTO_APPLY_THRESHOLD = 0.9;

export interface RulesResult {
  // Rule to auto-apply (confidence >= 0.9), if any
  match: Rule | null;
  // Lower-confidence matches passed to Claude as hints
  hints: Rule[];
}

function ruleMatches(rule: Rule, tx: Transaction): boolean {
  const pattern = rule.merchantPattern.toLowerCase();
  const haystacks = [tx.merchantRaw, tx.merchantDisplay]
    .filter(Boolean)
    .map((s) => (s as string).toLowerCase());
  return haystacks.some((h) => h.includes(pattern));
}

export async function matchRules(
  user: User,
  tx: Transaction
): Promise<RulesResult> {
  const [personal, industry, global] = await Promise.all([
    db.query.rules.findMany({ where: eq(rules.userId, user.id) }),
    user.businessIndustry
      ? db.query.rules.findMany({
          where: and(
            isNull(rules.userId),
            eq(rules.layer, "industry"),
            eq(rules.industry, user.businessIndustry)
          ),
        })
      : Promise.resolve([]),
    db.query.rules.findMany({
      where: and(isNull(rules.userId), eq(rules.layer, "global")),
    }),
  ]);

  const hints: Rule[] = [];
  for (const layer of [personal, industry, global]) {
    for (const rule of layer) {
      if (!ruleMatches(rule, tx)) continue;
      if (Number(rule.confidence ?? 0) >= AUTO_APPLY_THRESHOLD) {
        return { match: rule, hints };
      }
      hints.push(rule);
    }
  }
  return { match: null, hints };
}

// Plain-English source description for the transparency pillar
export function ruleSourceDescription(rule: Rule): string {
  switch (rule.layer) {
    case "personal":
      return `matched your own rule for "${rule.merchantPattern}" — based on how you've categorized this before`;
    case "industry":
      return `matched a seeded rule for the ${rule.industry?.replace("_", " ")} industry`;
    default:
      return `matched a common-merchant rule for "${rule.merchantPattern}"`;
  }
}
