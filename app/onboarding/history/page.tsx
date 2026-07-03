"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { ListeroLoader } from "@/components/ListeroLoader";

type Mode = "catch_up" | "start_fresh" | "self";

const OPTIONS: Array<{
  mode: Mode;
  title: string;
  body: string;
  badge?: string;
}> = [
  {
    mode: "catch_up",
    title: "Catch me up",
    body: "Listero pre-categorizes your past transactions and you confirm the uncertain ones in the review queue. Best if you want this year's books complete.",
    badge: "Recommended",
  },
  {
    mode: "start_fresh",
    title: "Start fresh",
    body: "Archive the history and watch from today forward. You can revisit and categorize archived transactions anytime from History.",
  },
  {
    mode: "self",
    title: "I'll handle the past myself",
    body: "Archive the history but keep it fully exportable and editable — for you or your accountant to work through on your terms.",
  },
];

// Mid-year signup: decide what to do with pre-signup history. Regardless of
// choice, the daily experience only surfaces new transactions.
export default function HistoryChoicePage() {
  const router = useRouter();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [progress, setProgress] = useState<{ remaining: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setMode = trpc.setHistoryMode.useMutation();

  async function choose(mode: Mode) {
    setBusy(mode);
    setError(null);
    try {
      await setMode.mutateAsync({ mode });
      if (mode === "catch_up") {
        // Drive bounded categorization batches until the backlog is done
        for (let i = 0; i < 100; i++) {
          const res = await fetch("/api/jobs/categorize-backlog", {
            method: "POST",
          });
          if (!res.ok) throw new Error("categorization batch failed");
          const data = (await res.json()) as { remaining: number };
          setProgress({ remaining: data.remaining });
          if (data.remaining === 0) break;
        }
      }
      router.push("/onboarding/slack");
    } catch {
      setError("Something hiccuped — try again.");
      setBusy(null);
      setProgress(null);
    }
  }

  if (busy === "catch_up" && progress !== null) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <ListeroLoader
          messages={[
            `Catching you up — ${progress.remaining} transaction${progress.remaining === 1 ? "" : "s"} to go…`,
            "Reading merchant patterns…",
            "Writing plain-English reasoning…",
          ]}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-coral">
        One more thing
      </p>
      <h1 className="mb-3 text-3xl font-bold">
        What should we do with your past transactions?
      </h1>
      <p className="mb-8 text-ink-soft">
        Your accounts came with history. Going forward Listero watches
        everything new automatically — this choice is only about the past.
      </p>

      <div className="space-y-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            disabled={busy !== null}
            onClick={() => choose(opt.mode)}
            className="block w-full rounded-xl border border-ink/15 bg-white p-5 text-left transition hover:border-coral disabled:opacity-50"
          >
            <p className="font-bold">
              {opt.title}
              {opt.badge && (
                <span className="ml-2 rounded-full bg-coral/10 px-2 py-0.5 text-xs font-semibold text-coral">
                  {opt.badge}
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-ink-soft">{opt.body}</p>
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
    </main>
  );
}
