import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, bankAccounts, bankConnections } from "@/db";
import { AccountTreatmentSelect } from "@/components/AccountTreatmentSelect";
import { ReconnectButton } from "@/components/ReconnectButton";
import { CsvImport } from "@/components/CsvImport";
import { getOrCreateUser } from "@/lib/user";
import { ConnectBankButton } from "@/components/ConnectBankButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const [connections, accounts] = await Promise.all([
    db.query.bankConnections.findMany({
      where: eq(bankConnections.userId, user.id),
    }),
    db.query.bankAccounts.findMany({
      where: eq(bankAccounts.userId, user.id),
    }),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-10">
        <h1 className="text-2xl font-bold">Settings</h1>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Business profile</h2>
        <div className="rounded-lg border border-ink/10 bg-white p-4 text-sm">
          <p>
            <span className="text-ink-soft">Name:</span>{" "}
            {user.businessName ?? "—"}
          </p>
          <p>
            <span className="text-ink-soft">Industry:</span>{" "}
            {user.businessIndustry ?? "—"}
          </p>
          <p>
            <span className="text-ink-soft">Location:</span>{" "}
            {user.businessLocation ?? "—"}
          </p>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Bank connections</h2>
        {connections.length === 0 ? (
          <p className="mb-3 text-sm text-ink-soft">No bank connected yet.</p>
        ) : (
          <ul className="mb-3 space-y-2">
            {connections.map((c) => {
              const accts = accounts.filter((a) => a.connectionId === c.id);
              return (
                <li
                  key={c.id}
                  className="rounded-lg border border-ink/10 bg-white p-4 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {c.institutionName ?? "Bank"}
                      {c.connectionType === "csv" && (
                        <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink-soft">
                          CSV · upload monthly, no live pings
                        </span>
                      )}
                    </span>
                    {c.status === "active" ? (
                      <span className="text-green-700">active</span>
                    ) : c.connectionType === "csv" ? (
                      <span className="text-ink-soft">{c.status}</span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-red-600">needs reconnect</span>
                        <ReconnectButton connectionId={c.id} />
                      </span>
                    )}
                  </div>
                  {accts.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-ink/5 pt-3">
                      {accts.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate text-ink-soft">
                            {a.accountName ?? "Account"}
                            {a.lastFour ? ` ··${a.lastFour}` : ""}
                          </span>
                          <AccountTreatmentSelect
                            accountId={a.id}
                            current={
                              (a.businessTreatment ?? "mixed") as
                                | "business"
                                | "personal"
                                | "mixed"
                            }
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mb-3 text-xs text-ink-soft">
          Mark each account business / personal / mixed — dedicated business
          cards help Listero categorize with more confidence.
        </p>
        <ConnectBankButton
          label={
            connections.length === 0 ? "Connect a bank" : "Connect another bank"
          }
        />
        <p className="mt-2 text-xs text-ink-soft">
          Connect every institution you spend from — checking, credit cards,
          business accounts. Listero watches them all.
        </p>
        <details className="mt-4 rounded-lg border border-ink/10 bg-white/60">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-ink-soft transition hover:text-ink">
            Card not on Plaid (Apple Card) or prefer not to link? Import a CSV
          </summary>
          <div className="border-t border-ink/5 p-4">
            <CsvImport />
          </div>
        </details>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Vendor rules</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Vendors Listero auto-handles for you — always-personal (Robinhood,
          groceries) or always-business (Adobe, Frame.io). Includes rules
          Listero offered after learning your patterns.
        </p>
        <Link
          href="/settings/vendor-rules"
          className="inline-block rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold transition hover:border-ink/50"
        >
          Manage vendor rules →
        </Link>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Slack</h2>
        <p className="mb-3 text-sm text-ink-soft">
          {user.slackTeamId
            ? "Connected — Listero DMs you about new purchases."
            : "Not connected yet."}
        </p>
        <a
          href="/api/slack/install"
          className="inline-block rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold transition hover:border-ink/50"
        >
          {user.slackTeamId ? "Reinstall Slack app" : "Add Listero to Slack"}
        </a>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your data</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Everything Listero knows about your business is yours. Download it
          all as JSON, anytime.
        </p>
        <span className="flex flex-wrap gap-3">
          <a
            href="/api/export"
            className="inline-block rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold transition hover:border-ink/50"
          >
            Export all my data (JSON)
          </a>
          <a
            href="/api/export/cpa"
            className="inline-block rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold transition hover:border-ink/50"
          >
            CPA export (CSV) — sortable by confidence
          </a>
        </span>
      </section>
    </main>
  );
}
