import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { CATEGORIES } from "@/lib/categories";
import type { Transaction, User } from "@/db";

// Natural-language reply → structured categorization decision.
// "that was gear for the Henderson wedding shoot" →
//   {category: Equipment, business_personal: business, note, ...}

const client = new Anthropic();

const ReplySchema = z.object({
  understood: z
    .boolean()
    .describe("false when the reply isn't about categorizing this transaction"),
  category: z.enum(CATEGORIES),
  business_personal: z.enum(["business", "personal", "internal"]),
  note: z
    .string()
    .describe(
      "short context worth remembering from the user's words (client, project, purpose); empty string if none"
    ),
  suggest_rule: z
    .boolean()
    .describe(
      "true only when the user clearly states this merchant should ALWAYS be handled this way"
    ),
  acknowledgement: z
    .string()
    .describe(
      "one warm, brief sentence confirming what you did, in plain English"
    ),
});

export type ParsedReply = z.infer<typeof ReplySchema>;

export async function parseReply(
  user: User,
  tx: Transaction,
  replyText: string
): Promise<ParsedReply | null> {
  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `A solo ${user.businessIndustry?.replace("_", " ") ?? "creative"} business owner (${user.businessName ?? "unknown"}) replied to a Slack notification about this bank transaction:

Transaction: ${tx.merchantDisplay ?? tx.merchantRaw} — $${tx.amount} (${tx.direction}) on ${tx.date}
Listero's current proposal: ${tx.category ?? "none"} / ${tx.businessPersonal ?? "unclassified"}

Their reply: "${replyText.slice(0, 500)}"

Interpret the reply as a categorization instruction. Choose the best category and business/personal/internal call based on what they said. Capture any client/project/purpose context as a note. Set understood=false only if the reply clearly isn't about categorizing (e.g. a question or unrelated chat). Never invent facts they didn't state.`,
      },
    ],
    output_config: { format: zodOutputFormat(ReplySchema), effort: "low" },
  });
  if (response.stop_reason === "refusal") return null;
  return response.parsed_output ?? null;
}
