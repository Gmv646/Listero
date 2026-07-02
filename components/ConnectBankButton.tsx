"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { trpc } from "@/lib/trpc";
import { ListeroLoader } from "@/components/ListeroLoader";

// Standalone "connect a(nother) bank" button — used in Settings. Each
// connection is a separate Plaid item with its own encrypted token.
export function ConnectBankButton({ label }: { label: string }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const createLinkToken = trpc.plaidCreateLinkToken.useMutation({
    onSuccess: (d) => setLinkToken(d.linkToken),
    onError: (e) => setError(e.message),
  });
  const exchange = trpc.plaidExchangePublicToken.useMutation({
    onSuccess: (d) => {
      setDone(
        `Connected — ${d.accountCount} account${d.accountCount === 1 ? "" : "s"} added.`
      );
      router.refresh();
    },
    onError: (e) => setError(e.message),
  });

  useEffect(() => {
    createLinkToken.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (publicToken, metadata) => {
      setDone(null);
      exchange.mutate({
        publicToken,
        institutionName: metadata.institution?.name ?? null,
      });
      // Fresh token so the button can be used again for yet another bank
      setLinkToken(null);
      createLinkToken.mutate();
    },
  });

  if (exchange.isPending) {
    return (
      <ListeroLoader
        messages={[
          "Linking your accounts…",
          "Importing the last 30 days…",
          "Encrypting your access token 🔐",
        ]}
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        disabled={!ready || !linkToken}
        onClick={() => open()}
        className="rounded-lg border border-coral px-4 py-2 text-sm font-semibold text-coral transition hover:bg-coral hover:text-white disabled:opacity-40"
      >
        {linkToken ? `+ ${label}` : "Preparing…"}
      </button>
      {done && <p className="mt-2 text-sm text-green-700">{done}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
