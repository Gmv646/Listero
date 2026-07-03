"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { trpc } from "@/lib/trpc";
import { ListeroLoader } from "@/components/ListeroLoader";
import { CsvImport } from "@/components/CsvImport";

const LINKING_MESSAGES = [
  "Linking your accounts…",
  "Shaking hands with your bank 🤝",
  "Importing your last 30 days of purchases…",
  "Encrypting your access token 🔐",
  "Almost there — warming up the categorizer…",
];

export default function ConnectBankPage() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCsv, setShowCsv] = useState(false);
  const [result, setResult] = useState<{
    accountCount: number;
    transactionCount: number;
  } | null>(null);

  const createLinkToken = trpc.plaidCreateLinkToken.useMutation({
    onSuccess: (d) => setLinkToken(d.linkToken),
    onError: (e) => setError(e.message),
  });
  const exchange = trpc.plaidExchangePublicToken.useMutation({
    onSuccess: (d) =>
      setResult({
        accountCount: d.accountCount,
        transactionCount: d.transactionCount,
      }),
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    createLinkToken.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      exchange.mutate({
        publicToken,
        institutionName: metadata.institution?.name ?? null,
      });
    },
  });

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-coral">
        Step 2 of 3
      </p>
      <h1 className="mb-4 text-3xl font-bold">Connect your first bank account</h1>
      <p className="mb-8 text-ink-soft">
        Listero connects to your bank through Plaid with read-only access. Your
        bank credentials never touch our servers, and access tokens are
        encrypted at rest.
      </p>

      {result ? (
        <div className="rounded-lg border border-green-300 bg-green-50 p-6">
          <p className="mb-2 font-semibold text-green-900">Bank connected ✓</p>
          <p className="mb-6 text-sm text-green-900">
            {result.accountCount} account{result.accountCount === 1 ? "" : "s"}{" "}
            linked
            {result.transactionCount > 0
              ? `, ${result.transactionCount} recent transaction${result.transactionCount === 1 ? "" : "s"} imported.`
              : ". Your recent transactions will appear within a few minutes."}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push("/onboarding/history")}
              className="rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
            >
              Continue →
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setLinkToken(null);
                createLinkToken.mutate();
              }}
              className="rounded-lg border border-coral px-6 py-3 font-semibold text-coral transition hover:bg-coral/10"
            >
              + Connect another bank
            </button>
          </div>
          <p className="mt-3 text-xs text-green-900/70">
            Got a credit card or a second account elsewhere? Connect every
            institution you spend from so nothing slips through.
          </p>
        </div>
      ) : exchange.isPending ? (
        <ListeroLoader messages={LINKING_MESSAGES} />
      ) : showCsv ? (
        <div className="rounded-xl border border-ink/10 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="font-bold">Import a CSV statement</p>
            <button
              type="button"
              onClick={() => setShowCsv(false)}
              className="text-sm text-ink-soft underline underline-offset-4"
            >
              ← Back to Plaid
            </button>
          </div>
          <CsvImport onDone={() => router.push("/onboarding/history")} />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Path 1: Plaid — recommended */}
          <div className="rounded-xl border-2 border-coral bg-white p-5">
            <p className="font-bold">
              Connect instantly with Plaid{" "}
              <span className="ml-1 rounded-full bg-coral/10 px-2 py-0.5 text-xs font-semibold text-coral">
                Recommended
              </span>
            </p>
            <p className="mb-4 mt-1 text-sm text-ink-soft">
              Live feed — new purchases ping you in Slack in near-real-time.
            </p>
            <button
              type="button"
              disabled={!ready || !linkToken}
              onClick={() => open()}
              className="w-full rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark disabled:opacity-40"
            >
              {linkToken
                ? "Connect a bank account"
                : "Preparing secure connection…"}
            </button>
          </div>

          {/* Path 2: CSV */}
          <div className="rounded-xl border border-ink/15 bg-white/60 p-5">
            <p className="font-bold">Import a CSV instead</p>
            <p className="mb-3 mt-1 text-sm text-ink-soft">
              For cards Plaid can&apos;t connect (like Apple Card) or if you&apos;d
              rather not link accounts. Batch, not live — upload a statement
              each month and Listero catches you up.
            </p>
            <button
              type="button"
              onClick={() => setShowCsv(true)}
              className="rounded-lg border border-ink/25 px-5 py-2.5 text-sm font-semibold transition hover:border-ink/60"
            >
              Upload a statement
            </button>
          </div>

          <p className="text-center text-sm">
            <button
              type="button"
              onClick={() => setShowCsv(true)}
              className="text-ink-soft underline underline-offset-4 transition hover:text-ink"
            >
              My card isn&apos;t listed / won&apos;t connect
            </button>
          </p>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </main>
  );
}
