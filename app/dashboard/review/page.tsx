"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { ListeroLoader } from "@/components/ListeroLoader";
import { TAX_EXPLANATIONS, DISCLAIMER } from "@/lib/categories";

type QueueItem = {
  id: string;
  date: string;
  merchant: string;
  amount: string;
  direction: string;
  category: string | null;
  reasoning: string | null;
  accountLabel: string | null;
};

// One transaction at a time. Confirming advances automatically;
// "flag for later" pushes the card to the back of the queue.
export default function ReviewPage() {
  const query = trpc.reviewQueue.useQuery(undefined, {
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [explain, setExplain] = useState(false);

  useEffect(() => {
    if (query.data && queue === null) {
      setQueue(query.data);
      setTotal(query.data.length);
    }
  }, [query.data, queue]);

  const confirm = trpc.confirmTransaction.useMutation({
    onSuccess: () => {
      setQueue((q) => (q ? q.slice(1) : q));
      setExplain(false);
    },
  });

  if (queue === null) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <ListeroLoader messages={["Loading your review queue…"]} />
      </main>
    );
  }

  const done = total - queue.length;
  const current = queue[0];

  if (!current) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16 text-center">
        <p className="mb-3 text-5xl">🎉</p>
        <h1 className="mb-2 text-2xl font-bold">
          {total > 0 ? "All clear!" : "Nothing to review"}
        </h1>
        <p className="mb-8 text-ink-soft">
          {total > 0
            ? `You reviewed ${done} transaction${done === 1 ? "" : "s"}. Your books are up to date.`
            : "New purchases will land here as they happen."}
        </p>
        <Link
          href="/dashboard"
          className="inline-block rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  const explanation = current.category
    ? TAX_EXPLANATIONS[current.category]
    : undefined;

  const bigBtn =
    "flex-1 rounded-xl px-4 py-4 text-base font-bold transition disabled:opacity-40";

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:px-6">
      {/* progress */}
      <div className="mb-6 flex items-center justify-between">
        <Link href="/dashboard" className="text-sm text-ink-soft hover:text-ink">
          ← Done for now
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-soft">
            {done + 1} of {total}
          </span>
          {total <= 12 ? (
            <span className="flex gap-1">
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i < done ? "bg-coral" : i === done ? "bg-ink" : "bg-ink/15"
                  }`}
                />
              ))}
            </span>
          ) : (
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-ink/10">
              <span
                className="block h-full rounded-full bg-coral transition-all"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </span>
          )}
        </div>
      </div>

      {/* the card */}
      <div className="rounded-2xl border border-ink/10 bg-white p-6 sm:p-8">
        <div className="mb-1 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xl font-bold leading-snug">{current.merchant}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {current.accountLabel ? `${current.accountLabel} · ` : ""}
              {current.date}
            </p>
          </div>
          <p
            className={`shrink-0 text-2xl font-black tabular-nums ${
              current.direction === "inflow" ? "text-green-700" : ""
            }`}
          >
            {current.direction === "outflow" ? "−" : "+"}${current.amount}
          </p>
        </div>

        {current.category && (
          <p className="mt-4 inline-block rounded-full bg-cream px-3 py-1 text-sm font-semibold">
            Listero proposes: {current.category}
          </p>
        )}
        {current.reasoning && (
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {current.reasoning}
          </p>
        )}

        {explain && explanation && (
          <div className="mt-4 rounded-lg bg-cream p-4 text-sm leading-relaxed">
            💡 {explanation}
            <p className="mt-2 text-xs text-ink-soft">{DISCLAIMER}</p>
          </div>
        )}

        {/* primary actions */}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate({
                transactionId: current.id,
                businessPersonal: "business",
              })
            }
            className={`${bigBtn} bg-coral text-white hover:bg-coral-dark`}
          >
            ✓ Business
          </button>
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate({
                transactionId: current.id,
                businessPersonal: "personal",
              })
            }
            className={`${bigBtn} border border-ink/20 hover:border-ink/60`}
          >
            Personal
          </button>
          <button
            type="button"
            disabled={confirm.isPending}
            onClick={() =>
              confirm.mutate({
                transactionId: current.id,
                businessPersonal: "internal",
              })
            }
            className={`${bigBtn} border border-ink/20 hover:border-ink/60`}
          >
            🔁 Transfer
          </button>
        </div>

        {/* secondary actions */}
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setQueue((q) => (q && q.length > 1 ? [...q.slice(1), q[0]] : q));
              setExplain(false);
            }}
            className="text-ink-soft underline underline-offset-4 transition hover:text-ink"
          >
            Flag for later
          </button>
          {explanation && (
            <button
              type="button"
              onClick={() => setExplain((e) => !e)}
              className="text-ink-soft underline underline-offset-4 transition hover:text-ink"
            >
              What does this mean?
            </button>
          )}
        </div>
      </div>

      {confirm.isError && (
        <p className="mt-3 text-center text-sm text-red-600">
          Couldn&apos;t save — check your connection and try again.
        </p>
      )}
    </main>
  );
}
