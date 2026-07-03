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

// The full ledger — secondary view for hunting things down.
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: { filter?: string; q?: string };
}) {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const [txns, accounts, connections] = await Promise.all([
    db.query.transactions.findMany({
      where: eq(transactions.userId, user.id),
      orderBy: [desc(transactions.date), desc(transactions.createdAt)],
      limit: 500,
    }),
    db.query.bankAccounts.findMany({ where: eq(bankAccounts.userId, user.id) }),
    db.query.bankConnections.findMany({
      where: eq(bankConnections.userId, user.id),
    }),
  ]);

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
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const needsReview = (t: (typeof txns)[number]) =>
    (t.status === "pending" || t.status === "auto") &&
    t.businessPersonal !== "internal";

  let visible = txns;
  if (reviewFilter) visible = visible.filter(needsReview);
  if (q) {
    visible = visible.filter((t) =>
      [t.merchantDisplay, t.merchantRaw, t.category, cleanMerchant(t)]
        .filter(Boolean)
        .some((s) => (s as string).toLowerCase().includes(q))
    );
  }
  const pendingCount = txns.filter(needsReview).length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">All transactions</h1>
          <p className="text-sm text-ink-soft">
            The full ledger — search, filter, hunt things down.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="text-sm font-semibold text-coral"
        >
          ← Back to the brief
        </Link>
      </header>

      {/* search + filter */}
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2">
        {reviewFilter && <input type="hidden" name="filter" value="review" />}
        <input
          type="search"
          name="q"
          defaultValue={searchParams.q ?? ""}
          placeholder="Search merchant or category…"
          className="w-full max-w-xs rounded-full border border-ink/20 bg-white px-4 py-1.5 text-sm focus:border-coral focus:outline-none"
        />
        <Link
          href={q ? `/dashboard/history?q=${encodeURIComponent(searchParams.q ?? "")}` : "/dashboard/history"}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
            !reviewFilter
              ? "bg-ink text-cream"
              : "border border-ink/20 text-ink-soft hover:border-ink/50"
          }`}
        >
          All
        </Link>
        <Link
          href={`/dashboard/history?filter=review${q ? `&q=${encodeURIComponent(searchParams.q ?? "")}` : ""}`}
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
      </form>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/25 bg-white/40 px-6 py-14 text-center">
          <p className="mb-3 text-3xl">{q ? "🔍" : "🎉"}</p>
          <p className="mb-2 text-lg font-semibold">
            {q ? "No matches" : reviewFilter ? "All caught up" : "No transactions yet"}
          </p>
          <p className="mx-auto max-w-md text-sm text-ink-soft">
            {q
              ? `Nothing matching “${searchParams.q}”. Try a shorter search.`
              : reviewFilter
                ? "Nothing needs your review right now."
                : "Once a bank is connected, transactions land here."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-ink/5 rounded-xl border border-ink/10 bg-white">
          {visible.map((t) => {
            const isInternal = t.businessPersonal === "internal";
            const review = needsReview(t);
            const label = statusLabel(t);
            return (
              <div
                key={t.id}
                className={`flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap ${
                  isInternal ? "opacity-60" : ""
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cream text-lg"
                  aria-hidden
                >
                  {categoryIcon(t)}
                </span>
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
