import type { Transaction } from "@/db";

// Presentation helpers for transaction rows. Pure functions, no data access.

const CATEGORY_ICONS: Record<string, string> = {
  Equipment: "🧰",
  "Software & subscriptions": "💻",
  "Contract labor": "🤝",
  "Advertising & marketing": "📣",
  Travel: "✈️",
  "Meals (business)": "🍽️",
  "Vehicle & mileage": "🚗",
  "Home office": "🏠",
  "Office supplies": "📦",
  "Rent & studio space": "🏢",
  "Education & training": "🎓",
  Insurance: "🛡️",
  "Professional services": "💼",
  "Bank & payment fees": "🏦",
  "Phone & internet": "📶",
  "Client gifts": "🎁",
  Income: "↙️",
  Refund: "↩️",
  "Internal transfer": "🔁",
  Personal: "👤",
  Other: "🧾",
};

export function categoryIcon(tx: Transaction): string {
  if (tx.businessPersonal === "internal") return "🔁";
  if (tx.category && CATEGORY_ICONS[tx.category]) {
    return CATEGORY_ICONS[tx.category];
  }
  return tx.direction === "inflow" ? "↙️" : "🧾";
}

// Bank descriptors are often SHOUTING with trailing processor noise.
// "SQ *JOES COFFEE AUSTIN PPD ID: 12345" → "Sq *Joes Coffee Austin"
export function cleanMerchant(tx: Transaction): string {
  let s = (tx.merchantDisplay ?? tx.merchantRaw ?? "Unknown merchant").trim();
  s = s
    .replace(/\s+(PPD|WEB|CCD)\s+ID:\s*\S+.*$/i, "")
    .replace(/\s+ORIG CO NAME:.*$/i, "")
    .replace(/\s{2,}/g, " ");
  const letters = s.replace(/[^a-zA-Z]/g, "");
  const upper = letters.replace(/[^A-Z]/g, "");
  if (letters.length > 3 && upper.length / letters.length > 0.8) {
    s = s
      .toLowerCase()
      .replace(/(^|[\s\-/&.])([a-z])/g, (m, sep, ch) => sep + ch.toUpperCase());
  }
  return s.length > 48 ? s.slice(0, 45).trimEnd() + "…" : s;
}

export type StatusTone = "green" | "amber" | "muted" | "ink" | "coral";

// One meaningful label per row — what this transaction means for the
// user's books, not a raw DB status.
export function statusLabel(tx: Transaction): {
  text: string;
  tone: StatusTone;
} {
  if (tx.businessPersonal === "internal") {
    return { text: "internal transfer · nets to zero", tone: "muted" };
  }

  if (tx.status === "confirmed") {
    if (tx.businessPersonal === "personal") {
      return { text: "personal", tone: "muted" };
    }
    switch (tx.category) {
      case "Income":
        return { text: "revenue ✓", tone: "green" };
      case "Refund":
        return { text: "refund · offsets expense", tone: "green" };
      case "Contract labor":
        return { text: "business · track for 1099", tone: "coral" };
      case "Meals (business)":
        return { text: "business · 50% deductible", tone: "ink" };
      case "Client gifts":
        return { text: "business · flag for CPA ($25 cap)", tone: "amber" };
      default:
        return { text: "business · 100%", tone: "green" };
    }
  }

  // pending / auto — awaiting the user's tap
  if (tx.direction === "inflow") {
    return {
      text: tx.category === "Refund" ? "confirm refund" : "confirm revenue",
      tone: "amber",
    };
  }
  return { text: "confirm business", tone: "amber" };
}

export const TONE_CLASSES: Record<StatusTone, string> = {
  green: "text-green-700",
  amber: "text-amber-700",
  muted: "text-ink-soft/70",
  ink: "text-ink-soft",
  coral: "text-coral",
};
