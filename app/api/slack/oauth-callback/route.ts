import { NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { encryptSecret } from "@/lib/crypto";
import { verifyOAuthState } from "@/lib/slack/state";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;

  const fail = (reason: string) =>
    NextResponse.redirect(
      `${appUrl}/onboarding/slack?error=${encodeURIComponent(reason)}`
    );

  if (url.searchParams.get("error")) {
    return fail(url.searchParams.get("error")!);
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("missing_code_or_state");

  const verified = verifyOAuthState(state);
  if (!verified) return fail("invalid_state");

  const oauth = await new WebClient().oauth.v2.access({
    client_id: process.env.SLACK_CLIENT_ID ?? "",
    client_secret: process.env.SLACK_CLIENT_SECRET ?? "",
    code,
    redirect_uri: `${appUrl}/api/slack/oauth-callback`,
  });

  const botToken = oauth.access_token;
  const teamId = oauth.team?.id;
  const slackUserId = oauth.authed_user?.id;
  if (!oauth.ok || !botToken || !teamId || !slackUserId) {
    return fail("oauth_exchange_failed");
  }

  await db
    .update(users)
    .set({
      slackTeamId: teamId,
      slackBotTokenEncrypted: encryptSecret(botToken),
      slackUserId,
      onboardingComplete: true,
    })
    .where(eq(users.id, verified.userId));

  // Confirm the install works end-to-end with a welcome DM
  try {
    const bot = new WebClient(botToken);
    const dm = await bot.conversations.open({ users: slackUserId });
    if (dm.channel?.id) {
      await bot.chat.postMessage({
        channel: dm.channel.id,
        text: "You're all set! 🎉 Listero will ping you here the moment a new purchase hits your connected bank account — with a proposed category, the reasoning, and one-tap confirm buttons.",
      });
    }
  } catch (err) {
    // Install succeeded; welcome DM is best-effort
    console.warn("welcome DM failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.redirect(`${appUrl}/dashboard?slack=connected`);
}
