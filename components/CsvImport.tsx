"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { ListeroLoader } from "@/components/ListeroLoader";

const TREATMENTS = [
  { value: "business", label: "Business card / account" },
  { value: "personal", label: "Personal card / account" },
  { value: "mixed", label: "Mixed — I use it for both" },
] as const;

// CSV statement upload — the connection path for cards Plaid can't reach
// (Apple Card) and for privacy-conscious users. Batch, never live.
export function CsvImport({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [institution, setInstitution] = useState("");
  const [lastFour, setLastFour] = useState("");
  const [treatment, setTreatment] =
    useState<(typeof TREATMENTS)[number]["value"]>("business");
  const [accountType, setAccountType] = useState<"card" | "checking">("card");
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catchingUp, setCatchingUp] = useState<number | null>(null);

  const importCsv = trpc.importCsv.useMutation();

  async function submit() {
    if (!fileText || !institution.trim()) return;
    setError(null);
    setResult(null);
    try {
      const res = await importCsv.mutateAsync({
        institutionName: institution.trim(),
        lastFour: lastFour.trim() || undefined,
        businessTreatment: treatment,
        accountType,
        csvText: fileText,
      });
      // Categorize the new backlog in bounded batches (no Slack pings)
      if (res.inserted > 0) {
        for (let i = 0; i < 100; i++) {
          const r = await fetch("/api/jobs/categorize-backlog", {
            method: "POST",
          });
          if (!r.ok) break;
          const data = (await r.json()) as { remaining: number };
          setCatchingUp(data.remaining);
          if (data.remaining === 0) break;
        }
      }
      setCatchingUp(null);
      setResult(
        `Imported ${res.inserted} new transaction${res.inserted === 1 ? "" : "s"}` +
          (res.duplicates > 0
            ? ` (${res.duplicates} already imported — safe to re-upload overlapping statements)`
            : "") +
          `. Recognized format: ${res.format}.`
      );
      setFileText(null);
      setFileName("");
      router.refresh();
      onDone?.();
    } catch (e) {
      setCatchingUp(null);
      setError(
        e instanceof Error && e.message.includes("Couldn't read")
          ? e.message
          : "Import failed — make sure it's a CSV export from your bank and try again."
      );
    }
  }

  if (importCsv.isPending || catchingUp !== null) {
    return (
      <ListeroLoader
        messages={
          catchingUp !== null
            ? [`Categorizing — ${catchingUp} to go…`]
            : ["Reading your statement…", "Checking for duplicates…"]
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-cream p-3 text-xs text-ink-soft">
        📄 CSV accounts are <strong>batch, not live</strong> — no real-time
        Slack pings. Upload a statement each month and Listero catches you up.
        Works great for Apple Card (Wallet → card → ⋯ → Export Transactions)
        and any bank that exports CSV.
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold">
          Card or bank name
        </label>
        <input
          type="text"
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          placeholder="e.g. Apple Card"
          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-coral focus:outline-none"
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-semibold">
            Last 4 digits <span className="font-normal text-ink-soft">(optional)</span>
          </label>
          <input
            type="text"
            maxLength={4}
            value={lastFour}
            onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ""))}
            placeholder="1234"
            className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-coral focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm font-semibold">Type</label>
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value as "card" | "checking")}
            className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-coral focus:outline-none"
          >
            <option value="card">Credit / charge card</option>
            <option value="checking">Checking / bank account</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold">
          How do you use this account?
        </label>
        <select
          value={treatment}
          onChange={(e) =>
            setTreatment(e.target.value as (typeof TREATMENTS)[number]["value"])
          }
          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-coral focus:outline-none"
        >
          {TREATMENTS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-soft">
          A dedicated business card helps Listero categorize with more
          confidence.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold">
          Statement CSV
        </label>
        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-ink/30 bg-white px-4 py-6 text-sm text-ink-soft transition hover:border-coral">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              const reader = new FileReader();
              reader.onload = () => setFileText(String(reader.result ?? ""));
              reader.readAsText(f);
            }}
          />
          {fileName ? `📎 ${fileName}` : "Choose a .csv file…"}
        </label>
      </div>

      <button
        type="button"
        disabled={!fileText || !institution.trim()}
        onClick={submit}
        className="w-full rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark disabled:opacity-40"
      >
        Import statement
      </button>

      {result && <p className="text-sm text-green-700">{result}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
