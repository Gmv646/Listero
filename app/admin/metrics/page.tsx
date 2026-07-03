import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getOrCreateUser } from "@/lib/user";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Comma-separated admin emails; defaults to the founder account.
function isAdmin(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS ?? "gmv646@gmail.com")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return admins.includes(email.toLowerCase());
}

type Row = Record<string, unknown>;

async function q(query: ReturnType<typeof sql>): Promise<Row[]> {
  const res = await db.execute(query);
  return res as unknown as Row[];
}

export default async function AdminMetricsPage() {
  const user = await getOrCreateUser();
  if (!user || !isAdmin(user.email)) notFound();

  // All aggregates are anonymized: counts and rates across all users,
  // never individual transactions or merchant-to-user mappings.
  const [totals, byMethod, overrides, pendingMerchants, medianTap, weekly] =
    await Promise.all([
      q(sql`
        SELECT
          (SELECT count(*)::int FROM users) AS users,
          (SELECT count(*)::int FROM transactions) AS transactions,
          (SELECT count(*)::int FROM transactions WHERE status = 'pending' AND category IS NOT NULL) AS pending,
          (SELECT count(*)::int FROM transactions WHERE status = 'auto') AS auto,
          (SELECT count(*)::int FROM transactions WHERE status = 'confirmed') AS confirmed,
          (SELECT count(*)::int FROM transactions WHERE category IS NULL) AS uncategorized
      `),
      q(sql`
        SELECT method, count(*)::int AS n, round(avg(confidence)::numeric, 2) AS avg_conf
        FROM product_analytics
        WHERE event_type = 'categorization_completed'
        GROUP BY method ORDER BY n DESC
      `),
      q(sql`
        SELECT metadata->>'fromCategory' AS proposed, count(*)::int AS overridden
        FROM product_analytics
        WHERE event_type = 'user_action_taken' AND matched_proposal = false
        GROUP BY 1 ORDER BY overridden DESC LIMIT 10
      `),
      q(sql`
        SELECT merchant_display AS merchant, count(*)::int AS n
        FROM transactions
        WHERE status = 'pending' AND merchant_display IS NOT NULL
        GROUP BY 1 ORDER BY n DESC LIMIT 10
      `),
      q(sql`
        SELECT percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM a.created_at - d.created_at)
        ) AS median_secs
        FROM product_analytics a
        JOIN product_analytics d
          ON d.transaction_id = a.transaction_id
         AND d.event_type = 'slack_dm_sent'
        WHERE a.event_type = 'user_action_taken'
          AND a.created_at > d.created_at
      `),
      q(sql`
        SELECT date_trunc('week', created_at)::date AS week, event_type, count(*)::int AS n
        FROM product_analytics
        WHERE created_at > now() - interval '5 weeks'
        GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC
      `),
    ]);

  const t = totals[0] ?? {};
  const categorized =
    Number(t.auto ?? 0) + Number(t.confirmed ?? 0) + Number(t.pending ?? 0);
  const automationRate =
    categorized > 0
      ? Math.round((Number(t.auto ?? 0) / categorized) * 100)
      : null;
  const medianSecs = medianTap[0]?.median_secs
    ? Number(medianTap[0].median_secs)
    : null;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">Product metrics</h1>
      </header>
      <p className="mb-8 text-sm text-ink-soft">
        Anonymized aggregates across all users. Counts and rates only.
      </p>

      <section className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ["Users", t.users],
          ["Transactions", t.transactions],
          [
            "Automation rate",
            automationRate != null ? `${automationRate}%` : "—",
          ],
          [
            "Median DM → tap",
            medianSecs != null
              ? medianSecs < 3600
                ? `${Math.round(medianSecs / 60)}m`
                : `${(medianSecs / 3600).toFixed(1)}h`
              : "—",
          ],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-ink/10 bg-white p-4"
          >
            <p className="text-xs text-ink-soft">{String(label)}</p>
            <p className="text-2xl font-bold">{String(value ?? "—")}</p>
          </div>
        ))}
      </section>

      <Section title="Transactions by state">
        <SimpleTable
          headers={["pending", "auto", "confirmed", "uncategorized"]}
          rows={[
            [t.pending, t.auto, t.confirmed, t.uncategorized].map(String),
          ]}
        />
      </Section>

      <Section title="Categorization by method">
        <SimpleTable
          headers={["method", "count", "avg confidence"]}
          rows={byMethod.map((r) => [
            String(r.method ?? "?"),
            String(r.n),
            String(r.avg_conf ?? "—"),
          ])}
        />
      </Section>

      <Section title="Most-overridden AI proposals (calibration signal)">
        {overrides.length === 0 ? (
          <Empty text="No overrides yet." />
        ) : (
          <SimpleTable
            headers={["proposed category", "times overridden"]}
            rows={overrides.map((r) => [
              String(r.proposed ?? "?"),
              String(r.overridden),
            ])}
          />
        )}
      </Section>

      <Section title="Merchants stuck in pending (rules-gap signal)">
        {pendingMerchants.length === 0 ? (
          <Empty text="Nothing pending. 🎉" />
        ) : (
          <SimpleTable
            headers={["merchant", "pending count"]}
            rows={pendingMerchants.map((r) => [
              String(r.merchant),
              String(r.n),
            ])}
          />
        )}
      </Section>

      <Section title="Events per week">
        <SimpleTable
          headers={["week", "event", "count"]}
          rows={weekly.map((r) => [
            String(r.week),
            String(r.event_type),
            String(r.n),
          ])}
        />
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-ink-soft">{text}</p>;
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-ink/10 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-left text-ink-soft">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-ink/5 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
