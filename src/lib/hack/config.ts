import { HACK_MAX_TIER } from "@/lib/clearance";

// Every tunable for the terminal intrusion, in one place.
//
// All of it is server-side. The client is told a deadline as an absolute
// timestamp so it can render a countdown, and nothing else here ever informs
// a decision the browser makes.

// Development escape hatch. Without it stage 5 is not hand-testable: the whole
// ladder is roughly two minutes of continuous correct answers.
//
// Guarded on NODE_ENV so it cannot be switched on in production by setting an
// environment variable, which is the entire point of checking both.
const EASY =
  process.env.HACK_EASY === "1" && process.env.NODE_ENV !== "production";

export const HACK_EASY_MODE = EASY;

const TIME_SCALE = EASY ? 10 : 1;

export type StageSpec = {
  stage: number;
  // The clearance rank banked by clearing this stage.
  tier: number;
  // Rounds that must be cleared, back to back, to bank the tier.
  rounds: number;
  // Which games are eligible. Tracks the stage number by design.
  band: number;
  // Base per-round budget, before the drawn game's timeFactor.
  baseRoundMs: number;
  // Optional ceiling on the whole stage, on top of the per-round deadlines.
  stageCapMs: number | null;
  // How long the banked grant lasts.
  grantMs: number;
};

const MIN = 60 * 1000;

// The ladder.
//
// Stages 3-5 are meant to be brutal — that is the brief. Difficulty now comes
// entirely from round count, game band, and reward rather than a shrinking
// clock: every stage gets the same per-round budget.
const STAGE_ROUND_MS = 60_000;

export const STAGES: StageSpec[] = [
  { stage: 1, tier: 2, rounds: 1, band: 1, baseRoundMs: STAGE_ROUND_MS, stageCapMs: null, grantMs: 30 * MIN },
  { stage: 2, tier: 3, rounds: 1, band: 2, baseRoundMs: STAGE_ROUND_MS, stageCapMs: null, grantMs: 60 * MIN },
  { stage: 3, tier: 4, rounds: 2, band: 3, baseRoundMs: STAGE_ROUND_MS, stageCapMs: null, grantMs: 120 * MIN },
  { stage: 4, tier: 5, rounds: 3, band: 4, baseRoundMs: STAGE_ROUND_MS, stageCapMs: null, grantMs: 240 * MIN },
  { stage: 5, tier: HACK_MAX_TIER, rounds: 4, band: 5, baseRoundMs: STAGE_ROUND_MS, stageCapMs: null, grantMs: 360 * MIN },
];

export const MAX_STAGE = STAGES.length;

export function stageSpec(stage: number): StageSpec {
  const spec = STAGES.find((s) => s.stage === stage);
  if (!spec) throw new Error(`no such hack stage: ${stage}`);
  return spec;
}

export function roundDeadlineMs(stage: number, timeFactor: number): number {
  return Math.round(stageSpec(stage).baseRoundMs * timeFactor * TIME_SCALE);
}

export function stageCapMs(stage: number): number | null {
  const cap = stageSpec(stage).stageCapMs;
  return cap === null ? null : cap * TIME_SCALE;
}

export function tierForStage(clearedStages: number): number {
  if (clearedStages < 1) return 0;
  return stageSpec(Math.min(clearedStages, MAX_STAGE)).tier;
}

export function grantMsForStage(clearedStages: number): number {
  return stageSpec(Math.min(Math.max(clearedStages, 1), MAX_STAGE)).grantMs;
}

// Network latency absorber on the deadline check. Generous enough that a slow
// connection never loses a run it had won, small enough to be useless as a
// stalling tactic.
export const DEADLINE_GRACE_MS = 1_500;

// Absolute ceiling on a single run, independent of per-round deadlines. Backs
// up the lazy abandonment sweep for the case where a run is left with no open
// challenge at all.
export const MAX_RUN_MS = EASY ? 60 * MIN : 20 * MIN;

// One run per rolling 24h from the previous run's START. A failed run is
// punished with double that — a detected intrusion should cost something
// beyond the forfeited tiers.
export const COOLDOWN_MS = EASY ? 60 * 1000 : 24 * 60 * MIN;
export const FAILED_COOLDOWN_MS = EASY ? 60 * 1000 : 48 * 60 * MIN;

export const RUN_STATUS = {
  active: "active",
  extracted: "extracted",
  failed: "failed",
  abandoned: "abandoned",
} as const;

export const CHALLENGE_KINDS = {
  intrusion: "intrusion",
  trace: "trace",
} as const;

// RAISA's counter-trace: four reveals, one round each, drawn from the gentle
// end of the registry with a slack clock. Their job is oversight, not a
// gauntlet — the intruder is the one who is supposed to sweat.
export const TRACE_BAND_MAX = 2;
export const TRACE_TIME_SCALE = 2.5;
export const TRACE_BASE_ROUND_MS = 45_000;
export const TRACE_LOCKOUT_MS = 30 * MIN;
export const REVEAL_MAX = 4;

export function traceDeadlineMs(timeFactor: number): number {
  return Math.round(
    TRACE_BASE_ROUND_MS * timeFactor * TRACE_TIME_SCALE * TIME_SCALE
  );
}

// The counter-intrusion duel: one puzzle, two seats, one winner.
//
// A RAISA officer who catches a run while it is still active engages it, and
// both sides are served the SAME puzzle. Whoever answers correctly first takes
// it. Unlike the trace ladder this is not oversight — it is the confrontation,
// and both sides are meant to sweat.

// Mid-registry. Deep enough to be a real contest, shallow enough that it is
// the same contest for both seats — an officer is not running the ladder and
// has no banked stages to draw on, so a band-5 puzzle would be a formality
// for the intruder and an ambush for the desk.
export const DUEL_BAND = 3;

// Generous on purpose. There is no realtime transport in this deployment, so
// the intruder learns they have been engaged by polling; the clock has to be
// long enough that up to one poll interval of discovery latency can never be
// what decided a duel.
export const DUEL_ROUND_MS = 90_000;

// Per seat. A race wants room for a fumbled keystroke, but not so much room
// that a small answer space can simply be enumerated before the clock runs.
export const DUEL_ATTEMPTS = 3;

// Ceiling on how long an unengaged duel waits for the intruder to pick it up.
// Past this with nothing delivered, the terminal is dead and the defender
// takes it — closing the tab must never be a way to sit out a duel.
export const DUEL_PICKUP_MS = 3 * MIN;

// What an intruder wins: Layer 3, which pays tier 4 (L-4). Applied as a FLOOR,
// never a ceiling — see resolveDuel().
export const DUEL_PRIZE_STAGE = 3;

export const DUEL_WINNERS = {
  attacker: "attacker",
  defender: "defender",
} as const;

export type DuelWinner = (typeof DUEL_WINNERS)[keyof typeof DUEL_WINNERS];

export const DUEL_SEATS = {
  attacker: "attacker",
  defender: "defender",
} as const;

export type DuelSeat = (typeof DUEL_SEATS)[keyof typeof DUEL_SEATS];

export function duelDeadlineMs(timeFactor: number): number {
  return Math.round(DUEL_ROUND_MS * timeFactor * TIME_SCALE);
}

// "4 MIN" / "45 SEC" / "2 HR", for lockout and expiry notices. Mirrors
// formatRetryAfter in lib/rate-limit.ts rather than importing it, because that
// one tops out at minutes and a 48h lockout would read as "2880 MIN".
export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} SEC`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} MIN`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest === 0 ? `${hours} HR` : `${hours} HR ${rest} MIN`;
  const days = Math.floor(hours / 24);
  const spareHours = hours % 24;
  return spareHours === 0 ? `${days} DAY` : `${days} DAY ${spareHours} HR`;
}
