"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

export function SkipSlackButton() {
  const router = useRouter();
  const skip = trpc.skipSlack.useMutation({
    onSuccess: () => router.push("/dashboard"),
  });

  return (
    <button
      type="button"
      disabled={skip.isPending}
      onClick={() => skip.mutate()}
      className="text-sm font-medium text-ink-soft underline underline-offset-4 transition hover:text-ink disabled:opacity-50"
    >
      {skip.isPending ? "One sec…" : "Skip for now — I'll review on the web instead"}
    </button>
  );
}
