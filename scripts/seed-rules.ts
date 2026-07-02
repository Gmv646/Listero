// Idempotent seed of global + industry rules (user_id NULL rows only).
// Run: npx tsx scripts/seed-rules.ts   (loads env from .env.local via --env-file
// or shell; see package.json "seed" script)
import { isNull } from "drizzle-orm";
import { db, rules } from "../db";
import { GLOBAL_RULES, INDUSTRY_RULES } from "../lib/categorization/seed-data";

async function main() {
  const rows = [
    ...GLOBAL_RULES.map((r) => ({
      layer: "global",
      industry: null as string | null,
      merchantPattern: r.pattern,
      category: r.category,
      businessPersonal: r.businessPersonal,
      confidence: String(r.confidence),
    })),
    ...Object.entries(INDUSTRY_RULES).flatMap(([industry, list]) =>
      list.map((r) => ({
        layer: "industry",
        industry,
        merchantPattern: r.pattern,
        category: r.category,
        businessPersonal: r.businessPersonal,
        confidence: String(r.confidence),
      }))
    ),
  ];

  // Replace all seeded (non-user) rules atomically-enough for a seed script
  const deleted = await db
    .delete(rules)
    .where(isNull(rules.userId))
    .returning({ id: rules.id });
  await db.insert(rules).values(rows);

  console.log(
    `Seeded ${rows.length} rules (replaced ${deleted.length}): ` +
      `${GLOBAL_RULES.length} global + ` +
      Object.entries(INDUSTRY_RULES)
        .map(([k, v]) => `${v.length} ${k}`)
        .join(" + ")
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
