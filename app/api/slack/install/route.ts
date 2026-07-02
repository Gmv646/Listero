import { NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/user";
import { createOAuthState } from "@/lib/slack/state";

export const dynamic = "force-dynamic";

const SCOPES = "chat:write,im:write,users:read,commands,chat:write.public";

export async function GET(req: Request) {
  const user = await getOrCreateUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID ?? "",
    scope: SCOPES,
    redirect_uri: `${appUrl}/api/slack/oauth-callback`,
    state: createOAuthState(user.id),
  });

  return NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  );
}
