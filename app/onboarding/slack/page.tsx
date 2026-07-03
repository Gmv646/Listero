import { SkipSlackButton } from "@/components/SkipSlackButton";

export default function SlackOnboardingPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-coral">
        Step 3 of 3
      </p>
      <h1 className="mb-4 text-3xl font-bold">Install Listero in Slack</h1>
      <p className="mb-8 text-ink-soft">
        This is where Listero pings you about new purchases — with the proposed
        category, the reasoning in plain English, and one-tap confirm buttons.
        Install it into the workspace where you actually live during the day.
      </p>

      {searchParams.error && (
        <p className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Slack install didn&apos;t complete ({searchParams.error}). Try again.
        </p>
      )}

      <div className="flex flex-col items-start gap-5">
        <a
          href="/api/slack/install"
          className="inline-block rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
        >
          Add Listero to Slack
        </a>
        <SkipSlackButton />
      </div>
      <p className="mt-4 text-xs text-ink-soft">
        Without Slack, new purchases still get categorized — you confirm them
        on your dashboard instead of via DM. You can connect Slack anytime
        from Settings.
      </p>
    </main>
  );
}
