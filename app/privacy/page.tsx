import Link from "next/link";

export const metadata = { title: "Privacy Policy — Listero" };

const UPDATED = "July 3, 2026";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-8 text-xl font-bold">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-ink-soft">{children}</p>;
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="mb-1 text-3xl font-bold">Privacy Policy</h1>
      <p className="mb-8 text-sm text-ink-soft">Last updated: {UPDATED}</p>

      <P>
        Listero (&quot;Listero&quot;, &quot;we&quot;, &quot;us&quot;) is an
        AI-assisted bookkeeping tool for solo creative businesses, operated by
        Grant Viola. This policy explains what data we collect, how we use it,
        who we share it with, and the choices you have. The short version:
        we collect your transaction data to categorize it for you, we never
        sell your data, and you can export or delete everything at any time.
      </P>

      <H2>What we collect</H2>
      <P>
        <strong>Account information:</strong> your name, email address, and
        business profile (business name, industry, location), provided at
        signup.
      </P>
      <P>
        <strong>Financial transaction data:</strong> when you connect a bank
        or card through Plaid, we receive read-only transaction information —
        merchant names, amounts, dates, account names/last-four digits, and
        related metadata such as merchant location and Plaid&apos;s category
        signals. We receive an access token from Plaid; <strong>we never see
        or store your bank username or password</strong> — those are entered
        directly with Plaid. If you upload a CSV statement, we collect the
        transaction rows it contains.
      </P>
      <P>
        <strong>Slack information:</strong> if you install our Slack app, we
        store your Slack workspace ID, your Slack user ID, and a bot token so
        we can send you transaction notifications. If you reply to a Listero
        message in its thread, we process that reply to act on your
        instruction. We do not read your other Slack messages or channels.
      </P>
      <P>
        <strong>Usage data:</strong> product events such as when a
        categorization completed, when a notification was sent, and which
        buttons you tap — used to improve accuracy and the product.
      </P>

      <H2>How we use it</H2>
      <P>
        To run the service you signed up for: importing your transactions,
        proposing categorizations with plain-English reasoning, notifying you,
        recording your confirmations, learning your personal vendor rules, and
        producing summaries and exports. We also use aggregated, de-identified
        usage statistics to improve the product. We do not sell your personal
        information, and we do not use your data for advertising.
      </P>

      <H2>AI processing</H2>
      <P>
        Listero uses Anthropic&apos;s Claude models to propose transaction
        categories and to interpret your natural-language replies. To do this,
        relevant transaction details (merchant, amount, date, account
        classification, location metadata) and your business profile are sent
        to Anthropic&apos;s API for processing. Per Anthropic&apos;s commercial
        API terms, this data is not used to train their models.
        AI-generated categorizations and explanations are proposals for your
        review — they can be wrong, and they are not tax, legal, or financial
        advice (see our <Link href="/terms" className="text-coral underline">Terms of Service</Link>).
      </P>

      <H2>Service providers we share data with</H2>
      <P>
        We use a small set of processors, each only to the extent needed to
        provide the service: <strong>Plaid</strong> (bank connectivity — see
        Plaid&apos;s own end-user privacy policy), <strong>Anthropic</strong>{" "}
        (AI categorization), <strong>Slack</strong> (notifications you opted
        into), <strong>Clerk</strong> (sign-in and authentication),{" "}
        <strong>Supabase</strong> (database hosting), and{" "}
        <strong>Vercel</strong> (application hosting). We do not share your
        data with anyone else except as required by law.
      </P>

      <H2>Security</H2>
      <P>
        Bank access tokens and Slack tokens are encrypted at rest
        (AES-256-GCM). All data is encrypted in transit (TLS). Database
        access is protected by row-level security so each user&apos;s data is
        isolated to their account. Bank connections are read-only — Listero
        cannot move money, and the credentials we hold could not be used to
        move money. No system is perfectly secure; if we learn of a breach
        affecting your data, we will notify you promptly.
      </P>

      <H2>Your rights and choices</H2>
      <P>
        <strong>Export:</strong> download everything we hold about you,
        anytime, from Settings → &quot;Export all my data&quot;.{" "}
        <strong>Disconnect:</strong> remove bank connections from Settings, or
        revoke Listero from your bank or Slack workspace directly.{" "}
        <strong>Delete:</strong> email us (address below) and we will delete
        your account and associated data within 30 days, except records we
        must keep for legal compliance. Depending on your state (e.g.,
        California residents under the CCPA), you may have additional rights
        to access, correct, or delete personal information — contact us to
        exercise them; we honor such requests for all users regardless of
        state.
      </P>

      <H2>Data retention</H2>
      <P>
        We keep your data while your account is active so the service can
        work. Archived transactions remain yours and exportable. After account
        deletion, backups age out within 30 days.
      </P>

      <H2>Children</H2>
      <P>Listero is a business tool and not directed at anyone under 18.</P>

      <H2>Changes</H2>
      <P>
        If we make material changes to this policy, we will notify you by
        email or in-app before they take effect.
      </P>

      <H2>Contact</H2>
      <P>
        Questions or requests:{" "}
        <a href="mailto:grant@orangegrovesocial.com" className="text-coral underline">
          grant@orangegrovesocial.com
        </a>
      </P>

      <p className="mt-10 text-sm">
        <Link href="/" className="text-coral underline">← Back to Listero</Link>
      </p>
    </main>
  );
}
