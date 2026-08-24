import type { HackRun } from "@prisma/client";
import { db } from "@/lib/db";
import { createRng } from "@/lib/hack/rng";
import { REVEAL_MAX } from "@/lib/hack/config";

// The intrusion toolkit: earned, single-use countermeasures spent mid-run.
//
// WHY THIS EXISTS. The ladder had no economy — one run per 24 hours, win or
// lose, and nothing carried forward except a streak counter that was displayed
// and never spent. Depth was the only axis of progression, and it reset every
// time. Tools give a run consequences beyond its own outcome: clearing Layer 3
// pays something you still hold tomorrow, and choosing when to burn it is a
// decision the ladder never previously asked for.
//
// THE DESIGN RULE EVERY TOOL FOLLOWS: a tool may change the ODDS, never the
// VERDICT. Nothing here answers a puzzle, extends a deadline that has already
// passed, or converts a wrong answer into a right one. RECOMPILE trades clock
// for a fresh draw; DEADMAN trades depth for safety; SPOOF and GHOST act on
// RAISA's visibility, not on the ladder at all. The server still decides every
// outcome, which is the invariant lib/hack/engine.ts is built around and the
// one this module must not weaken.
//
// AND ONE THEY ALL FOLLOW TWICE: no tool may be spent to escape a round that is
// already lost. Every consumer below checks the run is live and unexpired
// first — otherwise DEADMAN becomes "click here after failing" and the
// EXTRACT/PUSH decision stops meaning anything.

export const TOOL_KINDS = {
  // Redraw the current round: a new game, a new payload, a fresh nonce — at a
  // shortened clock. The trade is the whole mechanic: escaping a puzzle you
  // cannot read costs you time on the one that replaces it.
  recompile: "recompile",
  // Hide the run from RAISA's live-intrusion board for a while. Buys quiet
  // passage through the deep stages, where a duel is most expensive to fight.
  spoof: "spoof",
  // Scrub one field the trace ladder has already uncovered. The only tool that
  // acts on a case AFTER the run is over.
  ghost: "ghost",
  // Arm the dead man's switch: the next failure banks what was already cleared
  // instead of forfeiting it. Insurance, bought before the risk is taken.
  deadman: "deadman",
} as const;

export type ToolKind = (typeof TOOL_KINDS)[keyof typeof TOOL_KINDS];

export const TOOL_ORDER: ToolKind[] = [
  TOOL_KINDS.recompile,
  TOOL_KINDS.deadman,
  TOOL_KINDS.spoof,
  TOOL_KINDS.ghost,
];

export const TOOL_LABELS: Record<ToolKind, string> = {
  [TOOL_KINDS.recompile]: "RECOMPILE",
  [TOOL_KINDS.spoof]: "SIGNAL SPOOF",
  [TOOL_KINDS.ghost]: "GHOST PROTOCOL",
  [TOOL_KINDS.deadman]: "DEAD MAN SWITCH",
};

export const TOOL_BRIEFS: Record<ToolKind, string> = {
  [TOOL_KINDS.recompile]:
    "Redraw this round with a different puzzle. The replacement runs on a shortened clock.",
  [TOOL_KINDS.spoof]:
    "Suppress this intrusion from the counter-intel board. Officers cannot engage what they cannot see.",
  [TOOL_KINDS.ghost]:
    "Scrub one field the desk has already traced on your last case. Cannot be used on a live run.",
  [TOOL_KINDS.deadman]:
    "Arm a fallback. If this run fails, the depth you have already cleared is banked instead of forfeited.",
};

export function isToolKind(value: string): value is ToolKind {
  return (TOOL_ORDER as string[]).includes(value);
}

// RECOMPILE's replacement clock, as a fraction of the round's normal budget.
// Tight enough that recompiling a puzzle you could have solved is a bad trade,
// generous enough that recompiling one you genuinely cannot read is a real out.
export const RECOMPILE_TIME_FACTOR = 0.6;

// How long a SIGNAL SPOOF hides a run from the live board.
export const SPOOF_DURATION_MS = 8 * 60 * 1000;

// Ceiling on unspent tools. Without it a member who never spends anything
// accumulates an arsenal and the scarcity that makes the choice interesting
// disappears. Earnings past the cap are simply not granted.
export const MAX_UNUSED_TOOLS = 5;

// The depth a run must reach before it pays a tool at all. Layer 3 is the first
// stage that takes two rounds back to back, so this is also the first depth
// that cannot be reached by luck.
export const TOOL_EARN_MIN_STAGE = 3;

export type ToolInventory = Record<ToolKind, number>;

export function emptyInventory(): ToolInventory {
  return { recompile: 0, spoof: 0, ghost: 0, deadman: 0 };
}

/** Unspent tools held by a member, counted by kind. */
export async function toolInventory(userId: string): Promise<ToolInventory> {
  const rows = await db.hackTool.findMany({
    where: { userId, usedAt: null },
    select: { kind: true },
  });
  const inventory = emptyInventory();
  for (const row of rows) {
    if (isToolKind(row.kind)) inventory[row.kind] += 1;
  }
  return inventory;
}

export function inventoryTotal(inventory: ToolInventory): number {
  return TOOL_ORDER.reduce((sum, kind) => sum + inventory[kind], 0);
}

/**
 * Pay out tools for a finished run.
 *
 * Called on extraction and on a duel win. Returns the kinds actually granted,
 * which may be fewer than asked for once MAX_UNUSED_TOOLS bites — the caller
 * shows the member what they got, so it must be told the truth.
 *
 * BEST-EFFORT, like conduct recording: a member who extracts successfully must
 * not see their run fail because a reward row would not write.
 */
export async function awardTools(input: {
  userId: string;
  runId: string | null;
  count: number;
}): Promise<ToolKind[]> {
  if (input.count <= 0) return [];
  try {
    const held = inventoryTotal(await toolInventory(input.userId));
    const room = Math.max(0, MAX_UNUSED_TOOLS - held);
    const grant = Math.min(input.count, room);
    if (grant === 0) return [];

    // Drawn at random rather than chosen. A member who could pick would always
    // pick the same one, and the toolkit would collapse to a single mechanic.
    const rng = createRng();
    const kinds: ToolKind[] = [];
    for (let i = 0; i < grant; i++) kinds.push(rng.pick(TOOL_ORDER));

    await db.hackTool.createMany({
      data: kinds.map((kind) => ({
        userId: input.userId,
        kind,
        earnedFromRunId: input.runId,
      })),
    });
    return kinds;
  } catch {
    return [];
  }
}

/** How many tools a run of this depth pays out. */
export function toolsEarnedFor(clearedStages: number): number {
  if (clearedStages < TOOL_EARN_MIN_STAGE) return 0;
  // Layer 3 pays one, Layer 5 pays two. Deliberately flat and legible rather
  // than a curve — a member should be able to predict their own reward.
  return clearedStages >= 5 ? 2 : 1;
}

/**
 * Spend one tool of `kind`, atomically.
 *
 * Uses a conditional updateMany on `usedAt: null` and checks the affected count
 * — the same conditional-write pattern resolveDuel() uses to claim a winner.
 * Two tabs clicking the same tool must spend one tool, not two, and must not
 * both be told they succeeded.
 *
 * Returns the id of the tool consumed, or null when there was nothing to spend.
 */
export async function consumeTool(
  userId: string,
  kind: ToolKind,
  runId: string | null
): Promise<string | null> {
  const candidate = await db.hackTool.findFirst({
    where: { userId, kind, usedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!candidate) return null;

  const { count } = await db.hackTool.updateMany({
    where: { id: candidate.id, usedAt: null },
    data: { usedAt: new Date(), usedOnRunId: runId },
  });
  return count === 1 ? candidate.id : null;
}

/** Hand a spent tool back after the effect it paid for could not be applied. */
export async function refundTool(toolId: string): Promise<void> {
  try {
    await db.hackTool.updateMany({
      where: { id: toolId },
      data: { usedAt: null, usedOnRunId: null },
    });
  } catch {
    /* best-effort — a lost refund costs one tool, a thrown error costs the run */
  }
}

/** Is this run currently hidden from the live-intrusion board? */
export function isSpoofed(
  run: Pick<HackRun, "spoofedUntil">,
  now = Date.now()
): boolean {
  return run.spoofedUntil !== null && run.spoofedUntil.getTime() > now;
}

/**
 * Roll back one step of the trace ladder on a case.
 *
 * Clamped at 0, and returns the level actually reached so the caller can tell
 * the member whether anything was scrubbed. Deliberately does NOT clear
 * `traceById` or `identifiedAt`: the record that RAISA got there stays, even
 * once the field itself is gone. GHOST buys back a field, not the history.
 */
export function ghostedRevealLevel(current: number): number {
  return Math.max(0, Math.min(current, REVEAL_MAX) - 1);
}
