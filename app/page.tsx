import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-coral">
        Listero · Private beta
      </p>
      <h1 className="mb-6 text-5xl font-bold leading-tight">
        Every business purchase, explained and filed —{" "}
        <span className="text-coral">in one tap.</span>
      </h1>
      <p className="mb-10 max-w-xl text-lg text-ink-soft">
        Listero watches your business bank account and pings you in Slack the
        moment you spend. It proposes a category, tells you <em>why</em> in
        plain English, and you confirm with one tap. Built for solo creatives —
        videographers, photographers, podcasters, designers, consultants.
      </p>
      <div className="flex gap-4">
        <Link
          href="/signup"
          className="rounded-lg bg-coral px-6 py-3 font-semibold text-white transition hover:bg-coral-dark"
        >
          Join the beta
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-ink/20 px-6 py-3 font-semibold transition hover:border-ink/50"
        >
          Log in
        </Link>
      </div>
      <p className="mt-16 text-xs text-ink-soft">
        Closed beta. Bank connections are read-only via Plaid. Your data is
        yours — export everything, anytime. Listero explains tax concepts for
        education; it is not tax advice.
      </p>
      <p className="mt-3 text-xs text-ink-soft">
        <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
          Privacy Policy
        </Link>
        {" · "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
          Terms of Service
        </Link>
      </p>
    </main>
  );
}
