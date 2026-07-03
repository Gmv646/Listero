"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

// Inline web confirmation — the Slack-optional review path.
export function ReviewButtons({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const [error, setError] = useState(false);
  const confirm = trpc.confirmTransaction.useMutation({
    onSuccess: () => router.refresh(),
    onError: () => setError(true),
  });

  if (confirm.isPending) {
    return <span className="text-xs text-ink-soft">Saving…</span>;
  }
  if (error) {
    return <span className="text-xs text-red-600">Failed — retry</span>;
  }

  const btn =
    "rounded border px-2 py-0.5 text-xs font-semibold transition";
  return (
    <span className="flex flex-wrap gap-1">
      <button
        type="button"
        title="Confirm as business"
        onClick={() =>
          confirm.mutate({ transactionId, businessPersonal: "business" })
        }
        className={`${btn} border-green-600 text-green-700 hover:bg-green-600 hover:text-white`}
      >
        ✓ Biz
      </button>
      <button
        type="button"
        title="Confirm as personal"
        onClick={() =>
          confirm.mutate({ transactionId, businessPersonal: "personal" })
        }
        className={`${btn} border-ink/30 text-ink-soft hover:bg-ink hover:text-white`}
      >
        Personal
      </button>
      <button
        type="button"
        title="Mark as internal transfer (not real spend)"
        onClick={() =>
          confirm.mutate({ transactionId, businessPersonal: "internal" })
        }
        className={`${btn} border-ink/30 text-ink-soft hover:bg-ink hover:text-white`}
      >
        🔁
      </button>
    </span>
  );
}
