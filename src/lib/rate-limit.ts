import { db } from "@/lib/db";

// Database-backed fixed-window throttling for credential and invite-code
// guessing.
//
// A DB table rather than an in-memory Map because the app runs on serverless
// functions: each invocation may get a fresh process, so process-local counters
// reset constantly and provide no real protection. The AuthAttempt table is
// shared across every instance.

export type RateLimitRule = {
  // Attempts permitted inside the window before the bucket locks.
  limit: number;
  // Window length in milliseconds.
  windowMs: number;
};

export const LOGIN_RULE: RateLimitRule = { limit: 8, windowMs: 15 * 60 * 1000 };
export const LOGIN_IP_RULE: RateLimitRule = { limit: 25, windowMs: 15 * 60 * 1000 };
export const INVITE_RULE: RateLimitRule = { limit: 10, windowMs: 30 * 60 * 1000 };

export type RateLimitStatus = {
  blocked: boolean;
  remaining: number;
  // Milliseconds until the oldest attempt in the window ages out.
  retryAfterMs: number;
};

function bucketKey(scope: string, id: string): string {
  return `${scope}:${id.toLowerCase()}`.slice(0, 200);
}

// Count attempts in the current window without recording a new one.
export async function checkRateLimit(
  scope: string,
  id: string,
  rule: RateLimitRule
): Promise<RateLimitStatus> {
  const key = bucketKey(scope, id);
  const since = new Date(Date.now() - rule.windowMs);

  try {
    const attempts = await db.authAttempt.findMany({
      where: { key, createdAt: { gte: since } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    const blocked = attempts.length >= rule.limit;
    const oldest = attempts[0]?.createdAt;
    const retryAfterMs =
      blocked && oldest
        ? Math.max(0, oldest.getTime() + rule.windowMs - Date.now())
        : 0;

    return {
      blocked,
      remaining: Math.max(0, rule.limit - attempts.length),
      retryAfterMs,
    };
  } catch (err) {
    // Fail open: a throttling outage must not lock every member out.
    console.warn("[rate-limit] check failed", key, err);
    return { blocked: false, remaining: rule.limit, retryAfterMs: 0 };
  }
}

// Record one failed attempt against the bucket.
export async function recordAttempt(
  scope: string,
  id: string,
  ip = ""
): Promise<void> {
  try {
    await db.authAttempt.create({
      data: { key: bucketKey(scope, id), ip: ip.slice(0, 64) },
    });
  } catch (err) {
    console.warn("[rate-limit] record failed", scope, err);
  }
}

// Clear a bucket after a legitimate success, so a member who mistypes a few
// times then logs in correctly starts clean.
export async function clearAttempts(scope: string, id: string): Promise<void> {
  try {
    await db.authAttempt.deleteMany({ where: { key: bucketKey(scope, id) } });
  } catch (err) {
    console.warn("[rate-limit] clear failed", scope, err);
  }
}

// Opportunistic pruning of rows older than any window we use. Called on a
// small fraction of requests so the table cannot grow without bound; there is
// no cron in this deployment.
const MAX_WINDOW_MS = 60 * 60 * 1000;
export async function pruneAttempts(probability = 0.02): Promise<void> {
  if (Math.random() > probability) return;
  try {
    await db.authAttempt.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - MAX_WINDOW_MS) } },
    });
  } catch {
    /* pruning is best-effort */
  }
}

// "4 MIN" / "45 SEC" for the lockout notice.
export function formatRetryAfter(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} SEC`;
  return `${Math.ceil(seconds / 60)} MIN`;
}
