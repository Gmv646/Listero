"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { trpc } from "@/lib/trpc";

export default function ConnectBankPage() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
            linked, {result.transactionCount} recent transaction
            {result.transactionCount === 1 ? "" : "s"} imported.
          </p>
          <button
            type="button"
            onClick={() => router.push("/onboarding/slack")}
            className="rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
          >
            Continue → Install Listero in Slack
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={!ready || !linkToken || exchange.isPending}
            onClick={() => open()}
            className="w-full rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark disabled:opacity-40"
          >
            {exchange.isPending
              ? "Linking your accounts…"
              : linkToken
                ? "Connect a bank account"
                : "Preparing secure connection…"}
          </button>
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </>
      )}
    </main>
  );
}
