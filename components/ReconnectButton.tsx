"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePlaidLink } from "react-plaid-link";
import { trpc } from "@/lib/trpc";

// One-tap re-auth for a broken bank connection (Plaid update mode).
export function ReconnectButton({ connectionId }: { connectionId: string }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const createToken = trpc.plaidCreateReconnectToken.useMutation({
    onSuccess: (d) => setLinkToken(d.linkToken),
  });
  const complete = trpc.plaidReconnectComplete.useMutation({
    onSuccess: () => {
      setDone(true);
      router.refresh();
    },
  });

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: () => complete.mutate({ connectionId }),
  });

  // Open Link automatically once the update-mode token arrives
  if (linkToken && ready && !complete.isPending && !done) open();

  if (done) return <span className="text-xs text-green-700">Reconnected ✓</span>;

  return (
    <button
      type="button"
      disabled={createToken.isPending || complete.isPending}
      onClick={() => createToken.mutate({ connectionId })}
      className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-coral-dark disabled:opacity-50"
    >
      {createToken.isPending || complete.isPending
        ? "Opening…"
        : "Reconnect →"}
    </button>
  );
}
