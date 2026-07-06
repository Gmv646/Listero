import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db, auditLog, bankConnections, transactions } from "@/db";
import { getOrCreateUser } from "@/lib/user";
import { CountUp } from "@/components/CountUp";

// Conservative effective rate for the tax-savings estimate. Deliberately
// low; the disclaimer + explainer make clear this is directional, not a
// filing figure. User-configurable rate is a planned settings option.
const CONSERVATIVE_TAX_RATE = 0.25;

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

  // YTD confirmed deductions → celebratory savings estimate
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const ytd = txns.filter((t) => t.date >= yearStart && !t.archived);
  const ytdDeductions =
    ytd
      .filter(
        (t) =>
          t.direction === "outflow" &&
          t.businessPersonal === "business" &&
          (t.status === "confirmed" || t.status === "auto")
      )
      .reduce((s, t) => s + Number(t.amount), 0) -
    ytd
      .filter(
        (t) =>
          t.direction === "inflow" &&
          t.category === "Refund" &&
          t.businessPersonal === "business"
      )
      .reduce((s, t) => s + Number(t.amount), 0);
  const taxSaved = Math.max(0, Math.round(ytdDeductions * CONSERVATIVE_TAX_RATE));

  // Heartbeat: newest successful sync across live connections
  const liveConns = connections.filter((c) => c.connectionType !== "csv");
  const lastSynced = connections
    .map((c) => c.lastSyncedAt)
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const hoursSinceSync = lastSynced
    ? (Date.now() - lastSynced.getTime()) / 3_600_000
    : null;
  const syncStale = liveConns.length > 0 && (hoursSinceSync ?? 0) > 72;
  const relativeSync =
    hoursSinceSync == null
      ? null
      : hoursSinceSync < 1
        ? "just now"
        : hoursSinceSync < 24
          ? `${Math.round(hoursSinceSync)}h ago`
          : `${Math.round(hoursSinceSync / 24)}d ago`;

  const brokenConn = connections.find(
    (c) => c.connectionType !== "csv" && c.status !== "active"
  );

  // Month strip numbers
  const revenueIn = thisMonth
    .filter(
      (t) =>
        t.direction === "inflow" &&
        t.businessPersonal === "business" &&
        t.category === "Income" &&
        (t.status === "confirmed" || t.status === "auto")
    )
    .reduce((s, t) => s + Number(t.amount), 0);

  // Streak: consecutive days (ending today/yesterday) with ≥1 confirmation.
  // Celebrates progress; a lapse just resets quietly — never shamed.
  const since = new Date();
  since.setDate(since.getDate() - 45);
  const confirmEvents = await db.query.auditLog.findMany({
    where: and(
      eq(auditLog.userId, user.id),
      gte(auditLog.createdAt, since),
      inArray(auditLog.action, ["user_confirm", "user_override"])
    ),
  });
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const activeDays = new Set(
    confirmEvents.map((e) => dayKey(e.createdAt ?? new Date()))
  );
  let streak = 0;
  const cursor = new Date();
  if (!activeDays.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const categorizedThisMonth = confirmEvents.filter(
    (e) => (e.createdAt ?? new Date()).toISOString().slice(0, 10) >= monthStartStr
  ).length;

  const connChip = (c: (typeof connections)[number]) => {
    const hrs = c.lastSyncedAt
      ? (Date.now() - c.lastSyncedAt.getTime()) / 3_600_000
      : null;
    const broken = c.connectionType !== "csv" && c.status !== "active";
    const stale = !broken && c.connectionType !== "csv" && (hrs ?? 999) > 72;
    return {
      id: c.id,
      label: c.institutionName ?? "Bank",
      csv: c.connectionType === "csv",
      dot: broken ? "bg-red-500" : stale ? "bg-amber-500" : "bg-green-600",
      when:
        c.connectionType === "csv"
          ? "CSV"
          : hrs == null
            ? "—"
            : hrs < 1
              ? "now"
              : hrs < 24
                ? `${Math.round(hrs)}h`
                : `${Math.round(hrs / 24)}d`,
    };
  };

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
      <header className="mb-6">
        <h1 className="text-2xl font-bold">
          {user.businessName ?? "Your business"}
        </h1>
        <p className="mt-2 text-ink-soft">{statusLine}</p>
      </header>

      {/* HERO — the savings moment. Serif number, counts up, disclaimed. */}
      {taxSaved > 0 && (
        <div className="anim-rise mb-6 rounded-2xl border border-ink/10 bg-white px-6 py-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-coral">
            You&apos;ve saved this year
          </p>
          <p className="mt-1 font-serif text-6xl tabular-nums sm:text-7xl">
            <CountUp value={taxSaved} prefix="~$" />
          </p>
          <p className="mt-1 text-lg">🎉</p>
          <p className="mt-2 text-sm text-ink-soft">
            from ${Math.round(ytdDeductions).toLocaleString("en-US")} in
            deductions you&apos;ve confirmed — and counting.
          </p>
          <details className="mt-3 text-xs text-ink-soft">
            <summary className="cursor-pointer select-none underline underline-offset-4">
              How is this calculated?
            </summary>
            <p className="mx-auto mt-2 max-w-sm">
              Your confirmed + auto-handled business deductions this year
              (minus business refunds), multiplied by a deliberately
              conservative {Math.round(CONSERVATIVE_TAX_RATE * 100)}% effective
              rate. Your real rate depends on your income, entity type, and
              state.
            </p>
          </details>
          <p className="mt-2 text-xs font-medium text-ink-soft">
            Estimate only · not tax advice · consult your accountant
          </p>
        </div>
      )}

      {/* Quiet month strip */}
      {connections.length > 0 && txns.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3 text-center">
          {[
            ["Business spend", `$${Math.round(deductionsFound).toLocaleString("en-US")}`],
            ["Revenue in", `$${Math.round(revenueIn).toLocaleString("en-US")}`],
            ["Needs review", String(needsReview.length)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-ink/10 bg-white/60 px-2 py-3">
              <p className="font-serif text-2xl tabular-nums">{value}</p>
              <p className="mt-0.5 text-xs text-ink-soft">{label} · this month</p>
            </div>
          ))}
        </div>
      )}

      {brokenConn && (
        <Link
          href="/settings"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 transition hover:bg-red-100"
        >
          <span>
            ⚠️ Your {brokenConn.institutionName ?? "bank"} connection needs a
            quick reconnect — new purchases aren&apos;t coming through.
          </span>
          <span className="font-semibold">Reconnect →</span>
        </Link>
      )}

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

      {/* Streak ribbon — celebration only, never shame */}
      {(streak >= 2 || categorizedThisMonth >= 5) && (
        <p className="anim-rise mt-6 rounded-full border border-ink/10 bg-white/70 px-4 py-2 text-center text-sm text-ink-soft">
          {categorizedThisMonth > 0 &&
            `${categorizedThisMonth} categorized this month!`}
          {streak >= 2 && ` 🔥 ${streak}-day streak`}
        </p>
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

      {/* Per-account chips doubling as the sync heartbeat */}
      {connections.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {connections.map((c) => {
            const chip = connChip(c);
            return (
              <Link
                key={chip.id}
                href="/settings"
                className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/70 px-3 py-1 text-xs text-ink-soft transition hover:border-ink/30"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
                {chip.label}
                <span className="text-ink-soft/60">{chip.when}</span>
              </Link>
            );
          })}
          <span className="w-full text-center text-xs text-ink-soft/60 sm:w-auto">
            {syncStale
              ? `⏸ quiet since ${relativeSync} — usually resolves itself`
              : `last synced ${relativeSync ?? "—"}`}
          </span>
        </div>
      )}
    </main>
  );
}
