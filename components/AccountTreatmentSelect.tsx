"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";

type Treatment = "business" | "personal" | "mixed";

export function AccountTreatmentSelect({
  accountId,
  current,
}: {
  accountId: string;
  current: Treatment;
}) {
  const [value, setValue] = useState<Treatment>(current);
  const [saved, setSaved] = useState(false);
  const mutate = trpc.setAccountTreatment.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  return (
    <span className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value as Treatment;
          setValue(v);
          mutate.mutate({ accountId, businessTreatment: v });
        }}
        className="rounded-lg border border-ink/15 bg-white px-2 py-1 text-xs focus:border-coral focus:outline-none"
      >
        <option value="business">Business</option>
        <option value="personal">Personal</option>
        <option value="mixed">Mixed</option>
      </select>
      {saved && <span className="text-xs text-green-700">✓</span>}
    </span>
  );
}
