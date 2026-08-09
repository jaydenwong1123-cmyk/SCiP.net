import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import type { SiteConfig } from "@/lib/site-config";
import { checkRateLimit, OMEGA_RULE } from "@/lib/rate-limit";

// OMEGA AUTHORITY — the two irreversible-adjacent controls, and the gate in
// front of them.
//
// Kept in its own module so both operations verify through exactly one code
// path. A second, subtly weaker copy of this check living next to an action is
// the most likely way this feature would fail.

export type OmegaOp = "terminate" | "purge";

export const OMEGA_OPS: Record<
  OmegaOp,
  { label: string; phrase: string; irreversible: boolean; blurb: string }
> = {
  terminate: {
    label: "SITE TERMINATION",
    phrase: "TERMINATE SCIP.NET",
    irreversible: false,
    blurb:
      "Darkens every route for every member, including the login screen. Data is untouched. Only you can restore it.",
  },
  purge: {
    label: "DATA PURGE",
    phrase: "PURGE ALL DATA",
    irreversible: true,
    blurb:
      "Destroys every record on the network — members, files, incidents, messages, cases, logs. Your account survives. Nothing else does. There is no backup.",
  },
};

export function isOmegaOp(value: string): value is OmegaOp {
  return value === "terminate" || value === "purge";
}

// The armed action must sit for this long before it can fire — enough to catch
// a misclick or a moment's doubt, short enough not to be theatre.
export const ARM_DELAY_MS = 10_000;
// ...and goes stale after this, so an arming left open in a forgotten tab is
// not a loaded weapon.
export const ARM_WINDOW_MS = 5 * 60_000;

// A single generic rejection for every failure. Which factor was wrong is
// exactly what an attacker is trying to learn, so the form never says.
export const OMEGA_REJECTED = "AUTHORIZATION REJECTED.";

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export type OmegaCredentials = {
  password: string;
  omegaKey: string;
  phrase: string;
};

export function readOmegaCredentials(formData: FormData): OmegaCredentials {
  return {
    password: String(formData.get("password") ?? ""),
    omegaKey: String(formData.get("omegaKey") ?? ""),
    phrase: String(formData.get("phrase") ?? ""),
  };
}

// Verifies every factor for one operation. Callers must already have
// established that the actor is the root owner holding a sentinel — that is
// requireRootOwner's job, not this function's.
//
// Returns `{ ok: false }` for a rejection and `{ ok: false, throttled: true }`
// when the bucket is spent, so the caller can decide whether to record another
// attempt against an already-locked bucket.
export async function verifyOmega(
  actorId: string,
  creds: OmegaCredentials,
  op: OmegaOp
): Promise<{ ok: boolean; throttled?: boolean }> {
  // Every other caller of the throttle treats a database outage as "allow", so
  // that an infrastructure problem cannot lock the whole membership out. Here
  // the calculus inverts: the cost of wrongly allowing an attempt is the site,
  // and the cost of wrongly refusing one is that the owner tries again later.
  let throttled: boolean;
  try {
    throttled = (await checkRateLimit("omega", actorId, OMEGA_RULE)).blocked;
  } catch {
    throttled = true;
  }
  if (throttled) return { ok: false, throttled: true };

  // The one factor that does not live in the database, and so the one an
  // attacker holding database access still cannot supply.
  const configured = process.env.OMEGA_KEY ?? "";
  if (configured.trim().length === 0) return { ok: false };
  if (!timingSafeEqualStr(creds.omegaKey, configured)) return { ok: false };

  // Re-read the hash rather than trusting anything carried in from the caller:
  // a password changed moments ago must take effect here immediately.
  const row = await db.user.findUnique({
    where: { id: actorId },
    select: { passwordHash: true },
  });
  if (!row) return { ok: false };
  if (!(await bcrypt.compare(creds.password, row.passwordHash))) {
    return { ok: false };
  }

  // Exact match, no normalization — the phrase exists to make the operator
  // spell out what they are about to do.
  if (creds.phrase !== OMEGA_OPS[op].phrase) return { ok: false };

  return { ok: true };
}

export type ArmState =
  | { armed: false }
  | { armed: true; op: OmegaOp; armedAt: Date; readyAt: number; expiresAt: number };

// Reads the arming recorded on the site config, discarding anything stale or
// unrecognized so a half-written row cannot present as armed.
export function armState(cfg: SiteConfig): ArmState {
  const { omegaArmedOp, omegaArmedAt } = cfg;
  if (!omegaArmedOp || !omegaArmedAt) return { armed: false };
  if (!isOmegaOp(omegaArmedOp)) return { armed: false };
  const armedMs = omegaArmedAt.getTime();
  if (Date.now() - armedMs > ARM_WINDOW_MS) return { armed: false };
  return {
    armed: true,
    op: omegaArmedOp,
    armedAt: omegaArmedAt,
    readyAt: armedMs + ARM_DELAY_MS,
    expiresAt: armedMs + ARM_WINDOW_MS,
  };
}

// May `op` fire right now? The client disables the button on the same
// condition, but this is the copy that decides — a request that never rendered
// the countdown is held to it just the same.
export function canFire(cfg: SiteConfig, op: OmegaOp, actorId: string): boolean {
  const state = armState(cfg);
  if (!state.armed) return false;
  if (state.op !== op) return false;
  // Armed by someone else's session is not armed for you.
  if (cfg.omegaArmedBy !== actorId) return false;
  const now = Date.now();
  return now >= state.readyAt && now <= state.expiresAt;
}

export const CLEAR_ARMING = {
  omegaArmedOp: null,
  omegaArmedAt: null,
  omegaArmedBy: null,
} as const;
