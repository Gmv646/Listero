# Listero — Post-Launch Roadmap (July 2, 2026)

Priority order: 1) categorization bugs → 5) analytics → 2) multi-user
readiness → beta cohort → 3) dashboard redesign + 4) tax disclaimer.
Full details live in the founder's planning doc; this file tracks status.

- [x] P1: internal transfer detection (pair match + Plaid PFC + global patterns)
- [x] P1: incoming credits always classified (transfer → refund → revenue proposal)
- [ ] P5: product_analytics telemetry + /admin/metrics
- [ ] P2a: Clerk production instance + user-deleted webhook
- [ ] P2b: onboarding edge cases (no-Slack web review fallback, resume, empty states)
- [ ] P2c: documented multi-tenant isolation audit
- [ ] P3: dashboard redesign (stat cards, per-account cards, streaks, rows, filters)
- [ ] P4: tax-saved estimate with disclaimer + user-set rate

Golden rule: multi-tenant SaaS — never hardcode a specific user's banks,
clients, or merchants. Global rules must make sense for a stranger.
