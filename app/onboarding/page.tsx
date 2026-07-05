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

const PRIMER_STEPS = [
  { emoji: "🏦", text: "Connect the accounts you spend from (read-only, encrypted)" },
  { emoji: "👀", text: "Listero watches every new purchase automatically" },
  { emoji: "💬", text: "You get a Slack ping with a proposed category and the why" },
  { emoji: "✓", text: "Tap once to confirm — your books stay clean, tax-ready" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [showPrimer, setShowPrimer] = useState(true);
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

  // One-screen primer before anything else — sets expectations, skippable
  if (showPrimer) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="anim-rise mb-3 text-3xl font-bold">
          Here&apos;s how Listero works
        </h1>
        <p className="anim-rise mb-8 text-ink-soft">
          Two minutes of setup, then your books basically keep themselves.
        </p>
        <ol className="anim-rise-late mb-10 space-y-4">
          {PRIMER_STEPS.map((s, i) => (
            <li key={i} className="flex items-start gap-4 rounded-xl border border-ink/10 bg-white p-4">
              <span className="text-2xl" aria-hidden>
                {s.emoji}
              </span>
              <span className="pt-1 text-sm">{s.text}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setShowPrimer(false)}
          className="w-full rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
        >
          Let&apos;s set up →
        </button>
        <p className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowPrimer(false)}
            className="text-sm text-ink-soft underline underline-offset-4"
          >
            Skip
          </button>
        </p>
      </main>
    );
  }

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
