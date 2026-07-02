"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";

const INDUSTRIES = [
  { value: "videography", label: "Videography" },
  { value: "photography", label: "Photography" },
  { value: "podcasting", label: "Podcasting" },
  { value: "design", label: "Design" },
  { value: "marketing_consulting", label: "Marketing consulting" },
  { value: "other", label: "Something else" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const [industry, setIndustry] = useState<string>("");
  const [location, setLocation] = useState("");
  const [entityName, setEntityName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const saveProfile = trpc.completeOnboardingProfile.useMutation({
    onSuccess: () => router.push("/onboarding/connect-bank"),
    onError: (e) => setError(e.message),
  });

  const canSubmit =
    industry !== "" && location.trim() !== "" && entityName.trim() !== "";

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-coral">
        Step 1 of 3
      </p>
      <h1 className="mb-8 text-3xl font-bold">Tell Listero about your business</h1>

      <div className="space-y-8">
        <div>
          <label className="mb-2 block font-semibold">
            What kind of business do you run?
          </label>
          <div className="grid grid-cols-2 gap-2">
            {INDUSTRIES.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setIndustry(opt.value)}
                className={`rounded-lg border px-4 py-3 text-left transition ${
                  industry === opt.value
                    ? "border-coral bg-coral/10 font-semibold"
                    : "border-ink/15 hover:border-ink/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            This seeds industry-specific categorization rules, so Listero asks
            you fewer questions from day one.
          </p>
        </div>

        <div>
          <label htmlFor="location" className="mb-2 block font-semibold">
            Where are you based?
          </label>
          <input
            id="location"
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Austin, TX"
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-3 focus:border-coral focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="entity" className="mb-2 block font-semibold">
            What&apos;s your legal business name?
          </label>
          <input
            id="entity"
            type="text"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            placeholder='e.g. "Painter Films LLC"'
            className="w-full rounded-lg border border-ink/15 bg-white px-4 py-3 focus:border-coral focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="button"
          disabled={!canSubmit || saveProfile.isPending}
          onClick={() =>
            saveProfile.mutate({
              businessIndustry: industry as never,
              businessLocation: location.trim(),
              businessName: entityName.trim(),
            })
          }
          className="w-full rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark disabled:opacity-40"
        >
          {saveProfile.isPending ? "Saving…" : "Continue → Connect your bank"}
        </button>
      </div>
    </main>
  );
}
