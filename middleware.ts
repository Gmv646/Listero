import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Public routes: landing + auth pages, and inbound webhooks/OAuth callbacks
// that authenticate via their own signature verification, not Clerk.
const isPublicRoute = createRouteMatcher([
  "/",
  "/privacy",
  "/terms",
  "/signup(.*)",
  "/login(.*)",
  "/api/plaid/webhook",
  "/api/slack/oauth-callback",
  "/api/slack/interactive",
  "/api/slack/events",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
