# Multi-tenant isolation audit

Run before every major release, and after any change to schema, RLS
policies, or query paths:

```sh
npm run audit:isolation
```

The script (`scripts/isolation-audit.ts`) creates two synthetic tenants with
bank connections and transactions, then verifies and cleans up:

| # | Check | Layer |
|---|---|---|
| 1 | Tenant A's transaction queries return zero B rows | App (Drizzle scoping) |
| 2 | A's export payload contains none of B's ids or merchant strings | App (`/api/export` shape) |
| 3 | `authenticated` role + A's JWT claims sees only A's rows | Database (RLS) |
| 4 | A's session cannot read B's merchant data | Database (RLS) |
| 5 | `authenticated` with no JWT sees zero rows | Database (RLS) |
| 6 | `anon` role sees zero rows | Database (RLS) |
| 7 | A's session cannot UPDATE B's rows | Database (RLS write policy) |
| 8 | Synthetic tenants fully removed (cascade delete works) | Cleanup |

Exit code 0 = passed; non-zero = release-blocking failure.

Manual spot-check (quarterly or before major onboarding pushes): two real
accounts in separate browsers — confirm dashboard, Settings, and
`/api/export` show only that account's data, and Slack DMs land in the
right workspace.

Last automated run: see CI/release notes. First passing run: July 2, 2026.
