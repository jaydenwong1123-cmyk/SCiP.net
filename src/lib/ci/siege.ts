import {
  CI_COOLDOWN_MS,
  CI_HIT,
  CI_MISS_PENALTY,
  FAST_SOLVE_FACTOR,
  MAINFRAME_UNLOCK_FALLEN,
  RAISA_HEAL,
  RESTORE_ONLINE_PCT,
  SIEGE_DURATIONS_MIN,
  SIEGE_STATUS,
  type SiegeSide,
  type SiegeStatus,
} from "./config";
import { isRoutedSystem } from "./systems";

// The siege's rules as pure functions: no database, no session, and the clock
// is always passed in. Everything that decides an outcome lives here so it can
// be tested; siege-store.ts only reads rows, calls these, and writes the result.

export type SystemState = {
  system: string;
  integrity: number;
  maxIntegrity: number;
  fallenAt: Date | null;
  lockedUntil: Date | null;
};

type CiHints = {
  ciSiegeEndsAt: Date | null;
  ciDefacedUntil: Date | null;
  ciLockHorizon: Date | null;
};

/**
 * Signed integrity change for one answered puzzle. Negative drains.
 *
 * A wrong RAISA answer costs nothing: defending is already the harder seat,
 * since RAISA cannot know which system CI will hit next.
 */
export function drainAmount(side: SiegeSide, correct: boolean): number {
  if (side === "ci") return correct ? -CI_HIT : CI_MISS_PENALTY;
  return correct ? RAISA_HEAL : 0;
}

export function clampIntegrity(value: number, max: number): number {
  return Math.min(max, Math.max(0, Math.round(value)));
}

export function isFallen(system: Pick<SystemState, "fallenAt">): boolean {
  return system.fallenAt !== null;
}

export function fallenRoutedCount(systems: SystemState[]): number {
  return systems.filter((s) => isRoutedSystem(s.system) && isFallen(s)).length;
}

// The mainframe stays sealed until enough of the network around it is down.
export function mainframeOpen(systems: SystemState[]): boolean {
  return fallenRoutedCount(systems) >= MAINFRAME_UNLOCK_FALLEN;
}

/**
 * Has the siege reached its end? Either the clock has run out, or every system
 * that carries a section of the site is down — at which point there is
 * nothing left for RAISA to hold and no reason to make everyone wait.
 * A fallen mainframe alone never ends it.
 */
export function isSiegeDue(
  siege: { endsAt: Date },
  systems: SystemState[],
  now: Date
): boolean {
  if (now.getTime() >= siege.endsAt.getTime()) return true;
  const routed = systems.filter((s) => isRoutedSystem(s.system));
  return routed.length > 0 && routed.every(isFallen);
}

// CI wins if anything is still down when the siege ends. A system RAISA
// brought back online mid-siege has its fallenAt cleared, so it does not count.
export function outcomeFor(systems: SystemState[]): SiegeStatus {
  return systems.some(isFallen) ? SIEGE_STATUS.ciWon : SIEGE_STATUS.foundationHeld;
}

/**
 * Clearance tier of the file CI gets a look at. 0 means no leak.
 *
 * Capped at L-5 on purpose: L-6 and L-7 material is the site's top secrets and
 * no roleplay outcome should hand them to an account outside the network.
 */
export function leakTierFor(systems: SystemState[]): number {
  const mainframe = systems.find((s) => s.system === "mainframe");
  if (mainframe && isFallen(mainframe)) return 5;
  const fallen = fallenRoutedCount(systems);
  if (fallen >= 3) return 4;
  if (fallen >= 1) return 3;
  return 0;
}

// Should a fallen system come back online at this integrity?
export function restoresOnline(integrity: number, max: number): boolean {
  return integrity * 100 >= max * RESTORE_ONLINE_PCT;
}

// A correct answer this fast earns no credit.
export function isTooFast(elapsedMs: number, minHumanMs: number): boolean {
  return elapsedMs < minHumanMs * FAST_SOLVE_FACTOR;
}

export function isValidDuration(minutes: number): boolean {
  return SIEGE_DURATIONS_MIN.includes(minutes);
}

export function cooldownState(
  cfg: { ciCooldownUntil: Date | null },
  now: Date
): { ready: boolean; retryAfterMs: number } {
  const until = cfg.ciCooldownUntil?.getTime() ?? 0;
  const retryAfterMs = Math.max(0, until - now.getTime());
  return { ready: retryAfterMs === 0, retryAfterMs };
}

export function nextCooldown(now: Date): Date {
  return new Date(now.getTime() + CI_COOLDOWN_MS);
}

export function isSystemLocked(
  row: { lockedUntil: Date | null },
  now: Date
): boolean {
  return !!row.lockedUntil && row.lockedUntil.getTime() > now.getTime();
}

export function isDefaced(cfg: { ciDefacedUntil: Date | null }, now: Date): boolean {
  return !!cfg.ciDefacedUntil && cfg.ciDefacedUntil.getTime() > now.getTime();
}

function future(at: Date | null, now: Date): boolean {
  return !!at && at.getTime() > now.getTime();
}

/**
 * The hot-path short-circuit: true when the singleton says nothing siege-related
 * can be happening, so the caller may skip the siege tables entirely.
 *
 * ciSiegeEndsAt counts while set AT ALL, past or future — it is cleared only
 * when a siege is settled, and a siege whose clock has run out still needs
 * someone to come along and settle it.
 */
export function hintSaysQuiet(cfg: CiHints, now: Date): boolean {
  return (
    cfg.ciSiegeEndsAt === null &&
    !future(cfg.ciDefacedUntil, now) &&
    !future(cfg.ciLockHorizon, now)
  );
}

// Latest lock across a set of systems, for the ciLockHorizon hint.
export function lockHorizon(systems: { lockedUntil: Date | null }[]): Date | null {
  let latest: Date | null = null;
  for (const s of systems) {
    if (s.lockedUntil && (!latest || s.lockedUntil > latest)) latest = s.lockedUntil;
  }
  return latest;
}
