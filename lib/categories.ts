// Canonical expense categories for solo creative businesses, with static
// plain-English tax explanations ("What does this mean?" — MVP is curated
// text; AI-generated explanations are post-MVP).

export const CATEGORIES = [
  "Equipment",
  "Software & subscriptions",
  "Contract labor",
  "Advertising & marketing",
  "Travel",
  "Meals (business)",
  "Vehicle & mileage",
  "Home office",
  "Office supplies",
  "Rent & studio space",
  "Education & training",
  "Insurance",
  "Professional services",
  "Bank & payment fees",
  "Phone & internet",
  "Client gifts",
  "Income",
  "Personal",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const DISCLAIMER =
  "Educational only — not tax advice. Confirm specifics with your tax professional.";

// One-line deductibility hints shown inline in the Slack message
export const SHORT_HINTS: Record<string, string> = {
  Equipment: "likely 100% deductible (Section 179 or expense)",
  "Software & subscriptions": "typically 100% deductible",
  "Contract labor": "deductible; 1099-NEC if $600+/yr to one person",
  "Advertising & marketing": "fully deductible",
  Travel: "deductible when the trip is primarily business",
  "Meals (business)": "generally 50% deductible",
  "Vehicle & mileage": "mileage rate or actual costs — not both",
  "Home office": "deductible share if used exclusively for business",
  "Office supplies": "fully deductible",
  "Rent & studio space": "fully deductible",
  "Education & training": "deductible if it improves existing skills",
  Insurance: "business coverage is fully deductible",
  "Professional services": "fully deductible",
  "Bank & payment fees": "fully deductible",
  "Phone & internet": "deductible by business-use percentage",
  "Client gifts": "capped at $25 per recipient per year",
  Income: "counts toward gross business income",
  Personal: "not a business expense",
  Other: "may be deductible if ordinary and necessary",
};

export const TAX_EXPLANATIONS: Record<string, string> = {
  Equipment:
    "Business equipment (cameras, lenses, computers, lighting) is generally deductible. Under Section 179 you can usually deduct the full cost in the year you buy it instead of depreciating it over several years, as long as it's used more than 50% for business.",
  "Software & subscriptions":
    "Software and subscriptions you use to run your business (Adobe, editing tools, cloud storage, project management) are ordinary business expenses — typically 100% deductible in the year you pay for them.",
  "Contract labor":
    "Payments to freelancers and subcontractors (second shooters, editors, VAs) are deductible. If you pay any one person $600+ in a year, you generally need to send them a 1099-NEC in January.",
  "Advertising & marketing":
    "Money spent getting clients — ads, your website, business cards, portfolio hosting — is fully deductible as advertising expense.",
  Travel:
    "Business travel (flights, hotels, transit for shoots or client work away from home) is deductible when the primary purpose of the trip is business. Keep the reason for the trip with the record.",
  "Meals (business)":
    "Business meals — with clients, or while traveling for work — are generally only 50% deductible. Note who you met and why; a meal alone at your desk usually doesn't count.",
  "Vehicle & mileage":
    "You can deduct either actual vehicle costs (by business-use percentage) or the IRS standard mileage rate — not both. Most solo creatives use the mileage rate; a mileage log is what makes it defensible.",
  "Home office":
    "If part of your home is used regularly and exclusively for business, you can deduct a share of rent/mortgage interest, utilities, and insurance — or use the simplified rate per square foot.",
  "Office supplies":
    "Everyday consumables — memory cards, batteries, paper, packaging — are fully deductible supplies.",
  "Rent & studio space":
    "Rent for studios, co-working desks, or equipment/storage space used for business is fully deductible.",
  "Education & training":
    "Courses, workshops, and books that maintain or improve skills for your existing business are deductible. Education to enter a new line of work generally isn't.",
  Insurance:
    "Business insurance (gear coverage, liability, E&O) is fully deductible. Health insurance premiums may be deductible separately if you're self-employed.",
  "Professional services":
    "Accountants, lawyers, and consultants serving the business are fully deductible professional fees.",
  "Bank & payment fees":
    "Business bank fees, payment-processor cuts (Stripe, PayPal, Square), and merchant fees are deductible costs of getting paid.",
  "Phone & internet":
    "Deductible by business-use percentage. If your phone is 70% business, 70% of the bill is a business expense. A dedicated business line is 100%.",
  "Client gifts":
    "Business gifts are deductible only up to $25 per recipient per year — the classic gotcha. A $100 client gift yields a $25 deduction.",
  Income:
    "Money coming in. Deposits from clients count toward gross business income even before fees are taken out.",
  Personal:
    "Not a business expense — it won't appear in your business deductions. Keeping personal spending cleanly separated is what keeps your books audit-ready.",
  Other:
    "Doesn't fit a standard category. It may still be deductible if it's an ordinary and necessary expense for your business — worth a note to your tax pro.",
};
