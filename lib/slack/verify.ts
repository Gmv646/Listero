import { createHmac, timingSafeEqual } from "crypto";

// Slack request signing: v0=HMAC_SHA256(signing_secret, "v0:{ts}:{body}"),
// timestamp must be within 5 minutes to prevent replay.
export function verifySlackSignature(
  rawBody: string,
  headers: Headers
): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  const signature = headers.get("x-slack-signature");
  const timestamp = headers.get("x-slack-request-timestamp");
  if (!secret || !signature || !timestamp) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 60 * 5) return false;

  const expected =
    "v0=" +
    createHmac("sha256", secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex");

  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
