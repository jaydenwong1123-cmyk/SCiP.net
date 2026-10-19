import { HACK_EASY_MODE } from "@/lib/hack/config";

// Every tunable for the Chaos Insurgency siege, in one place.
//
// Client-safe: no server imports. The CI portal and the siege overlay both read
// labels and numbers from here, and nothing in this file decides anything on
// its own — the store (siege-store.ts) is where these are applied.
//
// Easy mode piggybacks on HACK_EASY, which is already guarded against
// production, so a local playtest can run a whole siege in a few minutes.
const EASY = HACK_EASY_MODE;

const SEC = 1000;
const MIN = 60 * SEC;

// Siege lengths the launcher may pick from, in minutes.
export const SIEGE_DURATIONS_MIN: readonly number[] = EASY
  ? [2, 5, 15]
  : [15, 20, 25, 30];

// One siege, then the whole network gets this long to breathe before the next.
export const CI_COOLDOWN_MS = EASY ? 1 * MIN : 24 * 60 * MIN;

// Integrity every routed system starts the siege at. The mainframe is tougher
// (see CI_SYSTEMS) and only opens once enough of the network is down.
export const SYSTEM_MAX = 100;
export const MAINFRAME_MAX = 150;
export const MAINFRAME_UNLOCK_FALLEN = 2;

// What one answered puzzle is worth.
//   CI correct     drains CI_HIT
//   CI wrong       gives the system CI_MISS_PENALTY back — a failed breach
//                  attempt trips the system's own countermeasures
//   RAISA correct  restores RAISA_HEAL
export const CI_HIT = 20;
export const CI_MISS_PENALTY = 2;
export const RAISA_HEAL = 15;

// A system that RAISA pushes back up to this share of its maximum, while the
// siege is still on, comes back online.
export const RESTORE_ONLINE_PCT = 25;

// After a siege, a fallen system stays locked for LOCK_MS past the siege's end
// unless RAISA clears it early with this many restore solves.
export const LOCK_MS = EASY ? 3 * MIN : 20 * MIN;
export const RESTORE_SOLVES = 3;

// A winning siege reskins the site for this long, and opens the leaked file to
// CI for LEAK_MS.
export const DEFACE_MS = EASY ? 3 * MIN : 30 * MIN;
export const LEAK_MS = EASY ? 3 * MIN : 10 * MIN;

// Puzzle difficulty on each side. Band 2 is the second rung of the intrusion
// ladder: real puzzles, but quick enough to keep a siege moving.
export const CI_BAND = 2;
export const RAISA_BAND = 2;

// Base per-puzzle clock, before the drawn game's timeFactor.
export const SIEGE_ROUND_MS = (EASY ? 10 : 1) * 60 * SEC;

// A correct answer faster than this share of the game's human floor scores
// nothing. Siege credit is competitive, so unlike the intrusion ladder (where
// speed is only ever evidence for a human reviewer) it is also enforced.
export const FAST_SOLVE_FACTOR = 0.5;

// Poll cadence for the siege overlay.
export const SIEGE_IDLE_POLL_MS = 10 * SEC;
export const SIEGE_ACTIVE_POLL_MS = 2 * SEC;

export const SIEGE_STATUS = {
  active: "active",
  ciWon: "ci_won",
  foundationHeld: "foundation_held",
  aborted: "aborted",
} as const;

export type SiegeStatus = (typeof SIEGE_STATUS)[keyof typeof SIEGE_STATUS];

export const SIEGE_STATUS_LABELS: Record<string, string> = {
  [SIEGE_STATUS.active]: "IN PROGRESS",
  [SIEGE_STATUS.ciWon]: "NETWORK BREACHED",
  [SIEGE_STATUS.foundationHeld]: "PERIMETER HELD",
  [SIEGE_STATUS.aborted]: "ABORTED BY STAFF",
};

export const SIEGE_SIDES = { ci: "ci", raisa: "raisa" } as const;
export type SiegeSide = (typeof SIEGE_SIDES)[keyof typeof SIEGE_SIDES];

export const SIEGE_PURPOSES = { siege: "siege", restore: "restore" } as const;
export type SiegePurpose = (typeof SIEGE_PURPOSES)[keyof typeof SIEGE_PURPOSES];
