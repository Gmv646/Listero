export default function SlackOnboardingPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-coral">
        Step 3 of 3
      </p>
      <h1 className="mb-4 text-3xl font-bold">Install Listero in Slack</h1>
      <p className="mb-8 text-ink-soft">
        This is where Listero pings you about new purchases — with the
        proposed category, the reasoning, and one-tap confirm buttons.
      </p>
      {/* Slack OAuth install button — wired on Day 3 */}
      <div className="rounded-lg border border-dashed border-ink/30 p-8 text-center text-ink-soft">
        Slack installation coming in the next build step.
      </div>
    </main>
  );
}
