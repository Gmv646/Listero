import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, bankConnections, transactions } from "@/db";
import { getOrCreateUser } from "@/lib/user";
import { ReviewButtons } from "@/components/ReviewButtons";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  auto: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
};

export default async function DashboardPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  // Resume-aware onboarding: send half-finished users to the right step
  if (!user.businessIndustry) redirect("/onboarding");

  const connections = await db.query.bankConnections.findMany({
    where: eq(bankConnections.userId, user.id),
  });
  if (!user.onboardingComplete && connections.length === 0) {
    redirect("/onboarding/connect-bank");
  }
  if (!user.onboardingComplete && !user.slackTeamId) {
    redirect("/onboarding/slack");
  }

  const txns = await db.query.transactions.findMany({
    where: eq(transactions.userId, user.id),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit: 100,
  });

  const slackConnected = Boolean(user.slackTeamId);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">
          {user.businessName ?? "Your business"}
        </h1>
        <p className="text-sm text-ink-soft">Recent transactions</p>
      </header>

      {!slackConnected && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-coral/40 bg-coral/5 px-4 py-3 text-sm">
          <span>
            💬 Connect Slack to get pinged the moment you spend — until then,
            confirm transactions right here.
          </span>
          <a
            href="/api/slack/install"
            className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-coral-dark"
          >
            Add to Slack
          </a>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/30 p-12 text-center">
          <p className="mb-2 text-lg font-semibold">
            Connect your first account to get started
          </p>
          <p className="mx-auto mb-6 max-w-md text-sm text-ink-soft">
            Listero watches your business spending and proposes a category for
            every purchase — you just confirm. Connect the accounts you spend
            from and the last 30 days import automatically.
          </p>
          <Link
            href="/settings"
            className="inline-block rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
          >
            Connect a bank account
          </Link>
        </div>
      ) : txns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/30 p-12 text-center">
          <p className="mb-2 font-semibold">Bank connected — importing…</p>
          <p className="text-sm text-ink-soft">
            Your recent transactions usually appear within a few minutes.
            Refresh this page shortly.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-ink-soft">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">B/P</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const isInternal = t.businessPersonal === "internal";
                const needsReview =
                  t.status === "pending" || t.status === "auto";
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-ink/5 last:border-0 ${
                      isInternal ? "text-ink-soft/70" : ""
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-3">
                      {isInternal ? "🔁 " : ""}
                      {t.merchantDisplay ?? t.merchantRaw ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-3 whitespace-nowrap ${
                        !isInternal && t.direction === "inflow"
                          ? "text-green-700"
                          : ""
                      }`}
                    >
                      {t.direction === "outflow" ? "−" : "+"}${t.amount}
                    </td>
                    <td className="px-4 py-3">{t.category ?? "—"}</td>
                    <td className="px-4 py-3">
                      {isInternal ? "nets to zero" : (t.businessPersonal ?? "—")}
                    </td>
                    <td className="px-4 py-3">
                      {needsReview ? (
                        <ReviewButtons transactionId={t.id} />
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            STATUS_STYLES[t.status ?? "pending"] ?? ""
                          }`}
                        >
                          {t.status}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
