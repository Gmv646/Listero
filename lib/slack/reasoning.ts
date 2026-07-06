import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";
import type { Transaction, User } from "@/db";

// The tax-reasoning partner: multi-turn deliberation in a transaction's
// Slack thread. Workshops deductibility with the user — educates, pushes
// back honestly when reasoning is weak, and only finalizes when a
// defensible treatment is reached. Documents a position + confidence;
// never gives definitive tax advice. Low confidence routes to the CPA.

const client = new Anthropic();

const DeliberationSchema = z.object({
  mode: z
    .enum(["continue", "finalize"])
    .describe(
      "continue = keep workshopping (ask/push back/educate); finalize = a defensible treatment is reached OR the user clearly just gave a direct instruction"
    ),
  reply: z
    .string()
    .describe(
      "What to say in the thread. For continue: your question/pushback/education, conversational, 1-3 short paragraphs max. For finalize: a brief recap of the treatment, the deductible %, and your confidence framing."
    ),
  category: z.enum(CATEGORIES),
  business_personal: z.enum(["business", "personal", "internal"]),
  deductible_pct: z
    .number()
    .describe("0-100; e.g. meals generally 50, equipment generally 100, personal 0"),
  confidence: z
    .number()
    .describe("0-1: how defensible this position is given the evidence discussed"),
  narrative: z
    .string()
    .describe(
      "CPA-ready narrative in 2-4 sentences: what was purchased, business purpose, evidence (receipt/user statements), and the tax treatment taken. Written third-person, professional."
    ),
  needs_cpa_review: z
    .boolean()
    .describe("true when confidence < 0.7 or the position involves a genuinely gray area"),
  cpa_review_reason: z
    .string()
    .describe("if needs_cpa_review: one sentence on exactly what the CPA should evaluate; else empty string"),
  note: z
    .string()
    .describe("short context worth remembering (client, project, purpose); empty if none"),
});

export type Deliberation = z.infer<typeof DeliberationSchema>;

export type ThreadTurn = {
  role: "user" | "assistant";
  text: string;
  image?: { mediaType: string; base64: string };
};

function contextBlock(user: User, tx: Transaction): string {
  return `You are Listero's tax-reasoning partner, talking with a solo ${user.businessIndustry?.replace("_", " ") ?? "creative"} business owner (${user.businessName ?? "their business"}, ${user.businessLocation ?? "US"}) inside a Slack thread about ONE bank transaction:

Transaction: ${tx.merchantDisplay ?? tx.merchantRaw} — $${tx.amount} (${tx.direction}) on ${tx.date}
Current status: ${tx.status} | current proposal: ${tx.category ?? "none"} / ${tx.businessPersonal ?? "unclassified"}${tx.userNote ? ` | prior note: ${tx.userNote}` : ""}

Your job — in this order of importance:
1. BE THE HONEST SKEPTIC, NOT A YES-MAN. If their reasoning for deductibility is weak, vague, or wishful, say so plainly and explain what's missing. Fake confidence is worse than no tool. If their reasoning is solid, say that too — don't manufacture doubt.
2. EDUCATE as you go: what makes this kind of expense deductible, at what percentage, and what documentation defends it (e.g. business meals generally 50% with who/why noted; equipment generally 100%; mixed-use requires a defensible business-use split).
3. WORKSHOP toward a defensible treatment across as few turns as reasonably possible. Ask at most ONE focused question per turn. If they attach a receipt, read it and use its contents (items, totals, date) as evidence.
4. FINALIZE when a defensible position is reached, or when the user gives a clear direct instruction (don't interrogate someone who just said "personal"). Assign an honest confidence score. Anything under 0.7, or genuinely gray, gets needs_cpa_review=true with a precise reason.
5. SAFETY POSTURE: you help document a position and assign confidence. You never give definitive tax advice — phrase treatments as "generally", "defensible", "worth confirming with your CPA". Never invent facts the user didn't state or the receipt doesn't show.

The conversation so far follows. Respond per the schema.`;
}

export async function deliberate(
  user: User,
  tx: Transaction,
  turns: ThreadTurn[]
): Promise<Deliberation | null> {
  type Block =
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "base64"; media_type: string; data: string };
      };

  const messages: Array<{ role: "user" | "assistant"; content: Block[] | string }> = [];
  messages.push({ role: "user", content: contextBlock(user, tx) });
  messages.push({
    role: "assistant",
    content: "Understood — I have the transaction context. What did they say?",
  });

  for (const t of turns) {
    if (t.role === "assistant") {
      messages.push({ role: "assistant", content: t.text || "(sent the transaction card)" });
    } else {
      const blocks: Block[] = [];
      if (t.image) {
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            media_type: t.image.mediaType,
            data: t.image.base64,
          },
        });
      }
      blocks.push({ type: "text", text: t.text || "(attached a receipt)" });
      messages.push({ role: "user", content: blocks });
    }
  }

  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 6000,
    messages: messages as Parameters<typeof client.messages.parse>[0]["messages"],
    output_config: { format: zodOutputFormat(DeliberationSchema), effort: "medium" },
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}
