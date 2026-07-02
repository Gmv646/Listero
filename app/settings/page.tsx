import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, bankConnections } from "@/db";
import { getOrCreateUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");

  const connections = await db.query.bankConnections.findMany({
    where: eq(bankConnections.userId, user.id),
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/dashboard" className="text-sm font-semibold text-coral">
          ← Dashboard
        </Link>
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
          <p className="text-sm text-ink-soft">No bank connected yet.</p>
        ) : (
          <ul className="space-y-2">
            {connections.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-ink/10 bg-white p-4 text-sm"
              >
                <span>{c.institutionName ?? "Bank"}</span>
                <span
                  className={
                    c.status === "active" ? "text-green-700" : "text-red-600"
                  }
                >
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">Slack</h2>
        <p className="text-sm text-ink-soft">
          {user.slackTeamId
            ? "Connected — Listero DMs you about new purchases."
            : "Not connected yet."}
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Your data</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Everything Listero knows about your business is yours. Download it
          all as JSON, anytime.
        </p>
        <a
          href="/api/export"
          className="inline-block rounded-lg border border-ink/20 px-4 py-2 text-sm font-semibold transition hover:border-ink/50"
        >
          Export all my data
        </a>
      </section>
    </main>
  );
}
