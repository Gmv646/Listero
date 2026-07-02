# Slack app setup (5 minutes, Grant does this once)

1. Go to https://api.slack.com/apps → **Create New App** → **From a manifest**.
2. Pick any workspace you own as the development workspace (e.g. Orange Grove
   Social). This does NOT limit which workspaces can install Listero.
3. Choose **JSON**, paste the contents of `slack-manifest.json`, create.
4. On the **Basic Information** page, copy into `.env.local` (and later
   Vercel):
   - **Client ID** → `SLACK_CLIENT_ID`
   - **Client Secret** → `SLACK_CLIENT_SECRET`
   - **Signing Secret** → `SLACK_SIGNING_SECRET`
5. Under **Manage Distribution** → **Enable Public Distribution** (needed so
   Josh can install it into his own workspace). Our scopes don't require
   Slack review.
6. Note: the redirect URL and interactivity URL in the manifest point at
   `https://app.getlistero.com`. Until DNS is live, we can temporarily use
   the Vercel deployment URL instead — Claude will handle swapping these
   during Day 5 deploy.

That's it. Slack install/OAuth/buttons are all handled by the app code.
