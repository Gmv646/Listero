import type { Transaction } from "@/db";

// Context enrichment from data we already have (Plaid's raw payload) plus an
// optional Google Places fallback (enabled only when GOOGLE_PLACES_API_KEY
// is set). Generic for every user and every card.

type PlaidRaw = {
  location?: {
    address?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
  } | null;
  merchant_name?: string | null;
  website?: string | null;
  logo_url?: string | null;
  personal_finance_category?: { primary?: string; detailed?: string } | null;
  payment_channel?: string | null;
};

export function txLocation(tx: Transaction): string | null {
  const loc = (tx.rawData as PlaidRaw | null)?.location;
  if (!loc) return null;
  const parts = [loc.city, loc.region].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function txWebsite(tx: Transaction): string | null {
  return (tx.rawData as PlaidRaw | null)?.website ?? null;
}

export function txChannel(tx: Transaction): string | null {
  const c = (tx.rawData as PlaidRaw | null)?.payment_channel;
  return c === "in store" || c === "online" ? c : null;
}

// Extra context lines for the categorization prompt — location, channel,
// and the bank's own category guess.
export function txEnrichmentForPrompt(tx: Transaction): string {
  const raw = tx.rawData as PlaidRaw | null;
  const lines: string[] = [];
  const loc = txLocation(tx);
  if (loc) lines.push(`- Location: ${loc}`);
  const channel = txChannel(tx);
  if (channel) lines.push(`- Payment channel: ${channel}`);
  if (raw?.website) lines.push(`- Merchant website: ${raw.website}`);
  const pfc = raw?.personal_finance_category?.detailed;
  if (pfc) lines.push(`- Bank's own category guess: ${pfc}`);
  return lines.join("\n");
}

// Optional Google Places fallback for merchants Plaid returns bare. Only
// runs when a key is configured; failures are silently ignored.
export async function placesLookup(
  merchant: string
): Promise<{ name: string; area: string } | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !merchant) return null;
  try {
    const res = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress",
        },
        body: JSON.stringify({ textQuery: merchant, maxResultCount: 1 }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        formattedAddress?: string;
      }>;
    };
    const p = data.places?.[0];
    if (!p?.displayName?.text) return null;
    // "123 Main St, Austin, TX 78701, USA" → "Austin, TX"
    const parts = (p.formattedAddress ?? "").split(",").map((s) => s.trim());
    const area = parts.length >= 3 ? parts.slice(-3, -1).join(", ") : "";
    return { name: p.displayName.text, area };
  } catch {
    return null;
  }
}
