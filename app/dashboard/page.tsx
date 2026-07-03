import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db, transactions } from "@/db";
import { getOrCreateUser } from "@/lib/user";
import { UserButton } from "@clerk/nextjs";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  auto: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
};

export default async function DashboardPage() {
  const user = await getOrCreateUser();
  if (!user) redirect("/login");
  if (!user.onboardingComplete && !user.businessIndustry) {
    redirect("/onboarding");
  }

  const txns = await db.query.transactions.findMany({
    where: eq(transactions.userId, user.id),
    orderBy: [desc(transactions.date), desc(transactions.createdAt)],
    limit: 100,
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-10 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {user.businessName ?? "Your business"}
          </h1>
          <p className="text-sm text-ink-soft">Recent transactions</p>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/settings" className="text-sm font-semibold text-coral">
            Settings
          </Link>
          <UserButton />
        </nav>
      </header>

      {txns.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink/30 p-12 text-center">
          <p className="mb-2 font-semibold">No transactions yet</p>
          <p className="text-sm text-ink-soft">
            Once your bank is connected, new purchases show up here — and ping
            you in Slack the moment they happen.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-ink-soft">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Merchant</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">B/P</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const isInternal = t.businessPersonal === "internal";
                return (
                  <tr
                    key={t.id}
                    className={`border-b border-ink/5 last:border-0 ${
                      isInternal ? "text-ink-soft/70" : ""
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-3">
                      {isInternal ? "🔁 " : ""}
                      {t.merchantDisplay ?? t.merchantRaw ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-3 whitespace-nowrap ${
                        !isInternal && t.direction === "inflow"
                          ? "text-green-700"
                          : ""
                      }`}
                    >
                      {t.direction === "outflow" ? "−" : "+"}${t.amount}
                    </td>
                    <td className="px-4 py-3">{t.category ?? "—"}</td>
                    <td className="px-4 py-3">
                      {isInternal ? "nets to zero" : (t.businessPersonal ?? "—")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_STYLES[t.status ?? "pending"] ?? ""
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
