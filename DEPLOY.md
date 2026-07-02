# Deploy checklist (Day 5)

## 1. Push the code (GitHub Desktop)
1. Open **GitHub Desktop** → File → **Add Local Repository** →
   choose `~/Claudecode/listero-saas`.
2. Click **Publish branch** (or **Push origin**). Repo: `Gmv646/Listero`.

## 2. Vercel environment variables
Vercel project (already connected to the repo) → **Settings → Environment
Variables** → paste the entire contents of `.env.production.local` into the
paste box, environment: **Production** (and Preview if you want preview
deploys to work). Redeploy after saving.

## 3. Domain
Vercel project → **Settings → Domains** → add `app.getlistero.com`.
Vercel shows a CNAME record — add it at your domain registrar:
`app` → `cname.vercel-dns.com`. Wait for the green check.

## 4. Slack app URLs (api.slack.com/apps → Listero)
Already correct if created from slack-manifest.json:
- OAuth redirect: `https://app.getlistero.com/api/slack/oauth-callback`
- Interactivity: `https://app.getlistero.com/api/slack/interactive`
Confirm **Public Distribution** is enabled (Manage Distribution).

## 5. Plaid dashboard
- Team Settings → Compliance: fill in company info if production requires it.
- Developers → API: add `https://app.getlistero.com/api/plaid/webhook` to
  allowed webhook URLs if prompted (webhook URL is also sent per link token).

## 6. Go-live tests (success criteria)
1. Grant signs up at app.getlistero.com → onboarding → connect real bank
   (PLAID_ENV=production) → install Slack → receive "You're all set!" DM.
2. Wait for/trigger a real purchase → Slack DM arrives → tap Confirm →
   message updates, dashboard shows confirmed.
3. Josh signs up separately → repeat → verify Grant's dashboard/export shows
   ZERO of Josh's data and vice versa (multi-tenant isolation).

## Notes
- Clerk keys are test-instance (`pk_test_`/`sk_test_`). Fine for the closed
  beta; create a production Clerk instance + custom domain post-MVP.
- Database: the same Supabase project is used for dev and prod (decided
  July 2). Wipe sandbox transactions before the beta if desired.
