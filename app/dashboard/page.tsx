import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, bankAccounts, bankConnections, transactions } from "@/db";
import { getOrCreateUser } from "@/lib/user";
import { ReviewButtons } from "@/components/ReviewButtons";
import {
  categoryIcon,
  cleanMerchant,
  statusLabel,
  TONE_CLASSES,
} from "@/lib/display";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
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

  const [txns, accounts] = await Promise.all([
    db.query.transactions.findMany({
      where: eq(transactions.userId, user.id),
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
      limit: 200,
    }),
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.userId, user.id),
    }),
  ]);

  // account id → "Chase ··4972"
  const connById = new Map(connections.map((c) => [c.id, c]));
  const accountLabel = new Map(
    accounts.map((a) => {
      const inst =
        (a.connectionId && connById.get(a.connectionId)?.institutionName) ||
        "Bank";
      return [a.id, a.lastFour ? `${inst} ··${a.lastFour}` : inst];
    })
  );

  const reviewFilter = searchParams.filter === "review";
  const needsReview = (s: string | null) => s === "pending" || s === "auto";
  const pendingCount = txns.filter((t) => needsReview(t.status)).length;
  const visible = reviewFilter
    ? txns.filter((t) => needsReview(t.status))
    : txns;

  const slackConnected = Boolean(user.slackTeamId);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">
          {user.businessName ?? "Your business"}
        </h1>
        <p className="text-sm text-ink-soft">Recent transactions</p>
      </header>

      {!slackConnected && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-coral/40 bg-coral/5 px-4 py-3 text-sm">
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

      {/* Filter pills */}
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/dashboard"
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            !reviewFilter
              ? "bg-ink text-cream"
              : "border border-ink/20 text-ink-soft hover:border-ink/50"
          }`}
        >
          All
        </Link>
        <Link
          href="/dashboard?filter=review"
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            reviewFilter
              ? "bg-ink text-cream"
              : "border border-ink/20 text-ink-soft hover:border-ink/50"
          }`}
        >
          Needs review
          {pendingCount > 0 && (
            <span
              className={`rounded-full px-1.5 text-xs font-bold ${
                reviewFilter ? "bg-coral text-white" : "bg-coral/15 text-coral"
              }`}
            >
              {pendingCount}
            </span>
          )}
        </Link>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          emoji="🏦"
          title="Connect your first account to get started"
          body="Listero watches your business spending and proposes a category for every purchase — you just confirm. Connect the accounts you spend from and the last 30 days import automatically."
          cta={{ href: "/settings", label: "Connect a bank account" }}
        />
      ) : txns.length === 0 ? (
        <EmptyState
          emoji="⏳"
          title="Bank connected — importing…"
          body="Your recent transactions usually appear within a few minutes. Refresh this page shortly."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          emoji="🎉"
          title="All caught up"
          body="Nothing needs your review right now. New purchases will show up here (and in Slack) as they happen."
          cta={{ href: "/dashboard", label: "View all transactions" }}
        />
      ) : (
        <div className="divide-y divide-ink/5 rounded-xl border border-ink/10 bg-white">
          {visible.map((t) => {
            const isInternal = t.businessPersonal === "internal";
            const review = needsReview(t.status);
            const label = statusLabel(t);
            return (
              <div
                key={t.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap ${
                  isInternal ? "opacity-60" : ""
                }`}
              >
                {/* category icon */}
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream text-lg"
                  aria-hidden
                >
                  {categoryIcon(t)}
                </span>

                {/* merchant + meta */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{cleanMerchant(t)}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {t.date}
                    {t.accountId && accountLabel.get(t.accountId)
                      ? ` · ${accountLabel.get(t.accountId)}`
                      : ""}
                    {t.category ? ` · ${t.category}` : ""}
                  </p>
                </div>

                {/* amount + status/actions */}
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`font-semibold tabular-nums ${
                      isInternal
                        ? "text-ink-soft/60"
                        : t.direction === "inflow"
                          ? "text-green-700"
                          : ""
                    }`}
                  >
                    {t.direction === "outflow" ? "−" : "+"}${t.amount}
                  </span>
                  {review ? (
                    <ReviewButtons transactionId={t.id} />
                  ) : (
                    <span className={`text-xs ${TONE_CLASSES[label.tone]}`}>
                      {label.text}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function EmptyState({
  emoji,
  title,
  body,
  cta,
}: {
  emoji: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="rounded-xl border border-dashed border-ink/25 bg-white/40 px-6 py-14 text-center">
      <p className="mb-3 text-3xl" aria-hidden>
        {emoji}
      </p>
      <p className="mb-2 text-lg font-semibold">{title}</p>
      <p className="mx-auto mb-6 max-w-md text-sm text-ink-soft">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="inline-block rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
