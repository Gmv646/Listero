import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";
import type { Rule, Transaction, User } from "@/db";
import { ruleSourceDescription } from "./rules";

// claude-sonnet-5 for routine categorization; claude-fable-5 for high-stakes
// (> $500) decisions, per product spec. If Fable declines or errors we
// degrade to Sonnet rather than leaving the transaction unproposed.
const ROUTINE_MODEL = "claude-sonnet-5";
const HARD_MODEL = "claude-fable-5";
const HARD_AMOUNT_THRESHOLD = 500;

const client = new Anthropic();

const ProposalSchema = z.object({
  category: z.enum(CATEGORIES),
  business_personal: z.enum(["business", "personal"]),
  confidence: z.number().describe("0 to 1"),
  reasoning: z
    .string()
    .describe(
      "2-3 plain-English sentences explaining WHY, referencing the user's business context and data sources"
    ),
  needs_more_context: z
    .boolean()
    .describe("true when you genuinely cannot tell without asking the user"),
});

export type Proposal = z.infer<typeof ProposalSchema>;

function buildPrompt(user: User, tx: Transaction, hints: Rule[]): string {
  const hintText =
    hints.length > 0
      ? `\nLower-confidence rule hints (not authoritative):\n${hints
          .map(
            (h) =>
              `- "${h.merchantPattern}" → ${h.category} / ${h.businessPersonal} (confidence ${h.confidence}, ${ruleSourceDescription(h)})`
          )
          .join("\n")}`
      : "";

  return `Categorize this bank transaction for a solo creative business owner.

Business profile:
- Legal name: ${user.businessName ?? "unknown"}
- Industry: ${user.businessIndustry?.replace("_", " ") ?? "unknown"}
- Location: ${user.businessLocation ?? "unknown"}
- Accounting method: ${user.accountingMethod ?? "cash"}

Transaction:
- Merchant (raw): ${tx.merchantRaw ?? "unknown"}
- Merchant (cleaned): ${tx.merchantDisplay ?? "unknown"}
- Amount: $${tx.amount} ${tx.currency} (${tx.direction})
- Date: ${tx.date}
${hintText}

Guidelines:
- The reasoning must be understandable by a non-accountant and explain WHY —
  reference their business ("You run a ${user.businessIndustry?.replace("_", " ") ?? "creative"} business…") and where the
  signal came from (merchant name pattern, industry norms, rule hints).
- Never invent facts about the purchase. If the merchant is ambiguous, pick
  the most likely category, lower your confidence, and set needs_more_context.
- Inflows from clients are Income. Transfers between own accounts and card
  payments are Other/personal with low confidence unless clearly identifiable.
- This proposal is educational, not tax advice; the user confirms every one.`;
}

async function callModel(
  model: string,
  prompt: string
): Promise<Proposal | null> {
  // Low effort keeps Slack pings snappy; the hard model gets medium for
  // more deliberation on high-dollar calls without multi-minute latency.
  const effort = model === HARD_MODEL ? "medium" : "low";
  const response = await client.messages.parse({
    model,
    max_tokens: 8000,
    messages: [{ role: "user", content: prompt }],
    output_config: { format: zodOutputFormat(ProposalSchema), effort },
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}

export async function proposeCategorization(
  user: User,
  tx: Transaction,
  hints: Rule[]
): Promise<{ proposal: Proposal; model: string } | null> {
  const prompt = buildPrompt(user, tx, hints);
  const useHardModel = Number(tx.amount) > HARD_AMOUNT_THRESHOLD;

  if (useHardModel) {
    try {
      const result = await callModel(HARD_MODEL, prompt);
      if (result) return { proposal: result, model: HARD_MODEL };
    } catch (err) {
      console.warn("hard-model categorization failed, degrading to routine", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const proposal = await callModel(ROUTINE_MODEL, prompt);
  return proposal ? { proposal, model: ROUTINE_MODEL } : null;
}
