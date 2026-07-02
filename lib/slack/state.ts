import { createHmac, timingSafeEqual } from "crypto";

// Signed OAuth state: binds the Slack install callback to the Listero user
// who initiated it. HMAC-SHA256 with the app encryption key; 10 minute TTL.

const TTL_MS = 10 * 60 * 1000;

function sign(payload: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is not set");
  return createHmac("sha256", key).update(payload).digest("hex");
}

export function createOAuthState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  return Buffer.from(`${payload}.${sign(payload)}`).toString("base64url");
}

export function verifyOAuthState(state: string): { userId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const mac = decoded.slice(lastDot + 1);
    const expected = sign(payload);
    if (
      mac.length !== expected.length ||
      !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
    ) {
      return null;
    }
    const [userId, tsStr] = payload.split(".");
    if (!userId || Date.now() - Number(tsStr) > TTL_MS) return null;
    return { userId };
  } catch {
    return null;
  }
}
