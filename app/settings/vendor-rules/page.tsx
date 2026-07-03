"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { CATEGORIES } from "@/lib/categories";
import { ListeroLoader } from "@/components/ListeroLoader";

// Vendor Rules — manage the ONE personal-rule system. Rules created here
// (proactive) and via "Listero learned something" offers (reactive) are the
// same objects and all appear on this page. Private per user.

type EditState = {
  ruleId: string;
  pattern: string;
  businessPersonal: "business" | "personal";
  category: string;
} | null;

export default function VendorRulesPage() {
  const utils = trpc.useUtils();
  const vendors = trpc.vendorList.useQuery();
  const rulesQ = trpc.vendorRulesList.useQuery();

  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const [pickBp, setPickBp] = useState<"business" | "personal">("personal");
  const [pickCat, setPickCat] = useState<string>("Personal");
  const [editing, setEditing] = useState<EditState>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = () => {
    utils.vendorRulesList.invalidate();
    utils.vendorList.invalidate();
  };
  const create = trpc.createVendorRule.useMutation({
    onSuccess: (d) => {
      setFlash(
        `Rule saved${d.reclassified > 0 ? ` — ${d.reclassified} past transaction${d.reclassified === 1 ? "" : "s"} reclassified` : ""}.`
      );
      setPicking(null);
      refresh();
    },
  });
  const update = trpc.updateVendorRule.useMutation({
    onSuccess: (d) => {
      setFlash(
        `Rule updated${d.reclassified > 0 ? ` — ${d.reclassified} transaction${d.reclassified === 1 ? "" : "s"} reclassified` : ""}.`
      );
      setEditing(null);
      refresh();
    },
  });
  const remove = trpc.deleteVendorRule.useMutation({
    onSuccess: (d) => {
      setFlash(
        `Rule removed${d.reset > 0 ? ` — ${d.reset} transaction${d.reset === 1 ? "" : "s"} sent back to review` : ""}.`
      );
      refresh();
    },
  });

  const ruledPatterns = useMemo(
    () => new Set((rulesQ.data ?? []).map((r) => r.merchantPattern)),
    [rulesQ.data]
  );
  const matches = useMemo(() => {
    if (!vendors.data || search.trim().length < 2) return [];
    const q = search.trim().toLowerCase();
    return vendors.data
      .filter(
        (v) =>
          v.display.toLowerCase().includes(q) &&
          !ruledPatterns.has(v.display.toLowerCase())
      )
      .slice(0, 8);
  }, [vendors.data, search, ruledPatterns]);

  if (rulesQ.isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <ListeroLoader messages={["Loading your vendor rules…"]} />
      </main>
    );
  }

  const groups: Array<{
    title: string;
    emoji: string;
    items: NonNullable<typeof rulesQ.data>;
  }> = [
    {
      title: "Personal",
      emoji: "👤",
      items: (rulesQ.data ?? []).filter((r) => r.businessPersonal === "personal"),
    },
    {
      title: "Business",
      emoji: "💼",
      items: (rulesQ.data ?? []).filter((r) => r.businessPersonal === "business"),
    },
    {
      title: "Other",
      emoji: "🧾",
      items: (rulesQ.data ?? []).filter(
        (r) => r.businessPersonal !== "personal" && r.businessPersonal !== "business"
      ),
    },
  ];

  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-2 flex items-end justify-between">
        <h1 className="text-2xl font-bold">Vendor rules</h1>
        <Link href="/settings" className="text-sm font-semibold text-coral">
          ← Settings
        </Link>
      </header>
      <p className="mb-6 text-sm text-ink-soft">
        Vendors Listero auto-handles for you — created here, or offered after
        you categorize a vendor the same way a few times. Private to your
        account.
      </p>

      {flash && (
        <p className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
          {flash}
        </p>
      )}

      {/* Add a rule: search a vendor */}
      <div className="mb-8 rounded-xl border border-ink/10 bg-white p-4">
        <p className="mb-2 font-semibold">Add a rule</p>
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPicking(null);
          }}
          placeholder="Search your vendors… (e.g. Robinhood)"
          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-coral focus:outline-none"
        />
        {matches.length > 0 && !picking && (
          <ul className="mt-2 divide-y divide-ink/5 rounded-lg border border-ink/10">
            {matches.map((v) => (
              <li key={v.display}>
                <button
                  type="button"
                  onClick={() => {
                    setPicking(v.display);
                    setPickBp("personal");
                    setPickCat("Personal");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-cream"
                >
                  <span>{v.display}</span>
                  <span className="text-xs text-ink-soft">
                    {v.count} transaction{v.count === 1 ? "" : "s"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {picking && (
          <div className="mt-3 rounded-lg bg-cream p-3">
            <p className="mb-2 text-sm font-semibold">
              Always treat “{picking}” as:
            </p>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setPickBp("personal");
                  setPickCat("Personal");
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${pickBp === "personal" ? "bg-ink text-cream" : "border border-ink/20"}`}
              >
                👤 Personal
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickBp("business");
                  setPickCat("Software & subscriptions");
                }}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold ${pickBp === "business" ? "bg-ink text-cream" : "border border-ink/20"}`}
              >
                💼 Business
              </button>
            </div>
            {pickBp === "business" && (
              <select
                value={pickCat}
                onChange={(e) => setPickCat(e.target.value)}
                className="mb-3 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm"
              >
                {CATEGORIES.filter(
                  (c) => c !== "Personal" && c !== "Internal transfer"
                ).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                create.mutate({
                  vendor: picking,
                  businessPersonal: pickBp,
                  category: pickCat as (typeof CATEGORIES)[number],
                  reclassifyExisting: true,
                })
              }
              className="w-full rounded-lg bg-coral px-4 py-2 text-sm font-semibold text-white transition hover:bg-coral-dark disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save rule + reclassify past transactions"}
            </button>
          </div>
        )}
      </div>

      {/* Existing rules, grouped */}
      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.title} className="mb-8">
              <h2 className="mb-2 text-lg font-semibold">
                {g.emoji} {g.title}
              </h2>
              <ul className="divide-y divide-ink/5 rounded-xl border border-ink/10 bg-white">
                {g.items.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium capitalize">
                          {r.merchantPattern}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {r.businessPersonal === "personal"
                            ? "Personal"
                            : `Business · ${r.category}`}{" "}
                          · affects {r.affectedCount} transaction
                          {r.affectedCount === 1 ? "" : "s"}
                        </p>
                      </div>
                      <div className="flex gap-2 text-xs font-semibold">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setEditing({
                              ruleId: r.id,
                              pattern: r.merchantPattern,
                              businessPersonal:
                                r.businessPersonal === "personal"
                                  ? "business"
                                  : "personal",
                              category:
                                r.businessPersonal === "personal"
                                  ? "Other"
                                  : "Personal",
                            })
                          }
                          className="rounded border border-ink/20 px-2 py-1 transition hover:border-ink/60"
                        >
                          Flip to{" "}
                          {r.businessPersonal === "personal"
                            ? "business"
                            : "personal"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            const reset = window.confirm(
                              `Remove the rule for "${r.merchantPattern}".\n\nOK = also send its ${r.affectedCount} auto-handled transactions back to review\nCancel-then-OK = keep them as they are`
                            );
                            remove.mutate({ ruleId: r.id, resetAffected: reset });
                          }}
                          className="rounded border border-red-300 px-2 py-1 text-red-600 transition hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {editing?.ruleId === r.id && (
                      <div className="mt-3 rounded-lg bg-cream p-3">
                        <p className="mb-2 text-sm">
                          Flip “{editing.pattern}” to{" "}
                          <strong>{editing.businessPersonal}</strong>
                          {editing.businessPersonal === "business" && (
                            <>
                              {" "}
                              as{" "}
                              <select
                                value={editing.category}
                                onChange={(e) =>
                                  setEditing({
                                    ...editing,
                                    category: e.target.value,
                                  })
                                }
                                className="rounded border border-ink/15 bg-white px-2 py-1 text-sm"
                              >
                                {CATEGORIES.filter(
                                  (c) =>
                                    c !== "Personal" && c !== "Internal transfer"
                                ).map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </>
                          )}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              update.mutate({
                                ruleId: editing.ruleId,
                                businessPersonal: editing.businessPersonal,
                                category: (editing.businessPersonal === "personal"
                                  ? "Personal"
                                  : editing.category) as (typeof CATEGORIES)[number],
                                reclassifyExisting: true,
                              })
                            }
                            className="rounded-lg bg-coral px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Flip + reclassify {r.affectedCount}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              update.mutate({
                                ruleId: editing.ruleId,
                                businessPersonal: editing.businessPersonal,
                                category: (editing.businessPersonal === "personal"
                                  ? "Personal"
                                  : editing.category) as (typeof CATEGORIES)[number],
                                reclassifyExisting: false,
                              })
                            }
                            className="rounded-lg border border-ink/20 px-3 py-1.5 text-xs font-semibold"
                          >
                            Flip rule only
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="px-2 text-xs text-ink-soft underline"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
      )}

      {(rulesQ.data ?? []).length === 0 && (
        <div className="rounded-xl border border-dashed border-ink/25 bg-white/40 px-6 py-10 text-center text-sm text-ink-soft">
          No vendor rules yet. Search a vendor above, or confirm a vendor the
          same way a few times and Listero will offer to auto-handle it.
        </div>
      )}
    </main>
  );
}
