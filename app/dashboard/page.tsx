import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, bankConnections, transactions } from "@/db";
import { getOrCreateUser } from "@/lib/user";

export const dynamic = "force-dynamic";

// "The Brief" — the default dashboard. A status line, one prominent
// review card, and everything auto-handled collapsed out of sight.
// The full ledger lives at /dashboard/history.
export default async function DashboardPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  // Resume-aware onboarding routing
  if (!user.businessIndustry) redirect("/onboarding");
  const connections = await db.query.bankConnections.findMany({
    where: eq(bankConnections.userId, user.id),
  });
  if (!user.onboardingComplete && connections.length === 0) {
    redirect("/onboarding/connect-bank");
  }
  if (!user.onboardingComplete && !user.historyMode) {
    redirect("/onboarding/history");
  }
  if (!user.onboardingComplete && !user.slackTeamId) {
    redirect("/onboarding/slack");
  }

  const txns = await db.query.transactions.findMany({
    where: eq(transactions.userId, user.id),
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const thisMonth = txns.filter((t) => t.date >= monthStartStr && !t.archived);

  const isInternal = (t: (typeof txns)[number]) =>
    t.businessPersonal === "internal";
  const needsReview = txns.filter(
    (t) => t.status === "pending" && !isInternal(t) && !t.archived
  );
  const transfersHandled = thisMonth.filter(isInternal).length;
  const autoHandled = thisMonth.filter(
    (t) => t.status === "auto" && !isInternal(t)
  ).length;
  const confirmedThisMonth = thisMonth.filter(
    (t) => t.status === "confirmed"
  ).length;

  const deductionsFound = thisMonth
    .filter(
      (t) =>
        t.direction === "outflow" &&
        t.businessPersonal === "business" &&
        (t.status === "confirmed" || t.status === "auto")
    )
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const statusLine = [
    "You're on track this month",
    deductionsFound > 0
      ? `$${deductionsFound.toLocaleString("en-US", { maximumFractionDigits: 0 })} in deductions found`
      : null,
    needsReview.length > 0
      ? `${needsReview.length} thing${needsReview.length === 1 ? "" : "s"} need${needsReview.length === 1 ? "s" : ""} your eyes`
      : "all caught up ✨",
  ]
    .filter(Boolean)
    .join(" · ");

  const slackConnected = Boolean(user.slackTeamId);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">
          {user.businessName ?? "Your business"}
        </h1>
        <p className="mt-2 text-ink-soft">{statusLine}</p>
      </header>

      {!slackConnected && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-coral/40 bg-coral/5 px-4 py-3 text-sm">
          <span>💬 Connect Slack to get pinged the moment you spend.</span>
          <a
            href="/api/slack/install"
            className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-coral-dark"
          >
            Add to Slack
          </a>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/25 bg-white/40 px-6 py-14 text-center">
          <p className="mb-3 text-3xl">🏦</p>
          <p className="mb-2 text-lg font-semibold">
            Connect your first account to get started
          </p>
          <p className="mx-auto mb-6 max-w-md text-sm text-ink-soft">
            Listero watches your business spending and proposes a category for
            every purchase — you just confirm.
          </p>
          <Link
            href="/settings"
            className="inline-block rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
          >
            Connect a bank account
          </Link>
        </div>
      ) : needsReview.length > 0 ? (
        <Link
          href="/dashboard/review"
          className="group block rounded-2xl bg-coral p-6 text-white shadow-none transition hover:bg-coral-dark sm:p-8"
        >
          <p className="text-4xl font-black sm:text-5xl">
            {needsReview.length}
          </p>
          <p className="mt-1 text-lg font-semibold">
            need{needsReview.length === 1 ? "s" : ""} review
          </p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white/15 px-4 py-2 font-semibold transition group-hover:bg-white/25">
            Start reviewing →
          </p>
        </Link>
      ) : (
        <div className="rounded-2xl border border-green-300 bg-green-50 px-6 py-12 text-center">
          <p className="mb-2 text-3xl">🎉</p>
          <p className="text-lg font-semibold text-green-900">
            All clear — nothing needs your eyes
          </p>
          <p className="mt-1 text-sm text-green-900/70">
            New purchases will show up here{slackConnected ? " and in Slack" : ""} as
            they happen.
          </p>
        </div>
      )}

      {/* Auto-handled fold — collapsed by default, ignorable by design */}
      {(transfersHandled > 0 || autoHandled > 0 || confirmedThisMonth > 0) && (
        <details className="mt-6 rounded-xl border border-ink/10 bg-white/60">
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-medium text-ink-soft transition hover:text-ink">
            Recently auto-handled — you can ignore these
          </summary>
          <div className="space-y-2 border-t border-ink/5 px-5 py-4 text-sm text-ink-soft">
            {transfersHandled > 0 && (
              <p>
                🔁 {transfersHandled} transfer
                {transfersHandled === 1 ? "" : "s"} netted to zero this month
              </p>
            )}
            {autoHandled > 0 && (
              <p>
                ✓ {autoHandled} auto-categorized by your rules this month
              </p>
            )}
            {confirmedThisMonth > 0 && (
              <p>✅ {confirmedThisMonth} confirmed by you this month</p>
            )}
            <p className="pt-2">
              <Link
                href="/dashboard/history"
                className="font-semibold text-coral"
              >
                View full history →
              </Link>
            </p>
          </div>
        </details>
      )}

      <p className="mt-8 text-center text-sm">
        <Link href="/dashboard/history" className="text-ink-soft underline underline-offset-4 transition hover:text-ink">
          All transactions
        </Link>
      </p>
    </main>
  );
}
