import crypto from "crypto";
import { cookies } from "next/headers";

// SENTINEL — a step-up challenge the seeded root owner answers after logging
// in, before anything else renders.
//
// Deliberately NOT part of `authorize` in lib/auth.ts. Failing there would make
// the owner account observably different from every other account at the login
// form, which is precisely the account an attacker most wants to identify.
// Credentials succeed normally; the session simply arrives without a sentinel
// and can reach nothing until it earns one.
//
// This gate applies to `isOwner` only. Co-owners and admins never see it — the
// whole point is that it protects the one account nobody else can be.

export const SENTINEL_COOKIE = "scip-sentinel";

export const SENTINEL_QUESTION = "Who watches the watchers' files?";

// Re-challenge after this long, so a session left open on a shared machine
// does not stay elevated indefinitely.
const SENTINEL_TTL_MS = 12 * 60 * 60 * 1000;

// Fold away the differences a human would not consider meaningful — case, outer
// whitespace, doubled spaces, a trailing period — and nothing beyond that. No
// fuzzy or partial matching: a near-miss is a miss.
function normalizeAnswer(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\.+$/, "")
    .trim();
}

// Constant-time comparison over the normalized forms. `timingSafeEqual` throws
// on a length mismatch, which would itself leak the expected length, so unequal
// lengths are folded into an ordinary false.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// The challenge is only armed when an answer is configured. An unset variable
// means SKIP, never "always fail": a missing env var on a fresh deploy must not
// be able to lock the owner out of their own site with no way back in.
export function sentinelConfigured(): boolean {
  return (process.env.OWNER_SENTINEL_ANSWER ?? "").trim().length > 0;
}

export function checkAnswer(submitted: string): boolean {
  const expected = process.env.OWNER_SENTINEL_ANSWER ?? "";
  if (expected.trim().length === 0) return false;
  return safeEqual(normalizeAnswer(submitted), normalizeAnswer(expected));
}

// Proof of passage is `userId.issuedAt.hmac`, signed with AUTH_SECRET. Unlike
// the maintenance bypass cookie — which stores the code itself and compares it
// verbatim — nothing here is useful to an attacker who reads it, and nothing
// can be fabricated without the server secret.
function sign(userId: string, issuedAt: number): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}.${issuedAt}`)
    .digest("base64url");
}

export async function issueSentinel(userId: string): Promise<void> {
  const issuedAt = Date.now();
  const jar = await cookies();
  jar.set(SENTINEL_COOKIE, `${userId}.${issuedAt}.${sign(userId, issuedAt)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SENTINEL_TTL_MS / 1000),
  });
}

export async function clearSentinel(): Promise<void> {
  const jar = await cookies();
  jar.delete(SENTINEL_COOKIE);
}

// Does this request carry a valid, unexpired sentinel for this member?
//
// Returns true when the challenge is not configured at all, so every caller can
// treat "sentinel held" as the single condition to check without also having to
// know whether the feature is switched on.
export async function hasSentinel(userId: string): Promise<boolean> {
  if (!sentinelConfigured()) return true;

  const jar = await cookies();
  const raw = jar.get(SENTINEL_COOKIE)?.value;
  if (!raw) return false;

  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [cookieUserId, issuedRaw, mac] = parts;

  // Bound to the account that answered: a sentinel cannot be carried across a
  // sign-out into a different session.
  if (cookieUserId !== userId) return false;

  const issuedAt = Number(issuedRaw);
  if (!Number.isFinite(issuedAt)) return false;
  if (Date.now() - issuedAt > SENTINEL_TTL_MS) return false;
  // Reject a future-dated cookie rather than trusting the clock skew.
  if (issuedAt > Date.now() + 60_000) return false;

  return safeEqual(mac, sign(cookieUserId, issuedAt));
}

// True when this member must answer the challenge before going any further.
// Only ever true for the seeded root owner.
export async function needsSentinel(user: {
  id: string;
  isOwner: boolean;
}): Promise<boolean> {
  if (!user.isOwner) return false;
  return !(await hasSentinel(user.id));
}
