# IDEAS — noted but deliberately NOT built for MVP

Out-of-scope observations parked here per the build spec.

- **Upgrade to Next 15** post-MVP: `npm audit` reports a high-severity
  advisory covering the entire Next 14 line; the fix requires a major upgrade.
  Acceptable risk for a 2-user closed beta, should be addressed before wider
  onboarding. (Would also unlock current Clerk v7.)
- Clerk webhook (`user.deleted`) → cascade-delete the user row, so account
  deletion in Clerk cleans up tenant data automatically. MVP relies on manual
  cleanup.
- Dashboard: allow confirming/re-categorizing transactions from the web UI,
  not just Slack.
- CSV export alongside JSON (accountants prefer CSV).
- **Email-forwarding transaction capture** (forward bank alert emails to an
  ingest address as a live-ish feed for non-Plaid cards): deliberately NOT
  built — fragile and inconsistent across banks. Revisit only if CSV-import
  friction proves to be a churn driver.
