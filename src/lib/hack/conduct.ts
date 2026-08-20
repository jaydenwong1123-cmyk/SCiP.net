import { db } from "@/lib/db";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { caseCode } from "@/lib/counter-intel";
import {
  CONDUCT_SIGNAL_RETENTION_MS,
  SUSPICION_FLAG_SCORE,
} from "@/lib/hack/config";
import { scoreSubmission, type ScoreInput } from "@/lib/hack/suspicion";

// Writing conduct evidence down.
//
// One entry point for all four seats — the intrusion ladder, RAISA's trace
// ladder, and both sides of a duel — so that the scoring rules, the retention
// rules and the flagging rule exist once rather than three times.
//
// A LEAF MODULE ON PURPOSE. It imports the scorer, the db and the audit log,
// and nothing from engine.ts or duel.ts. Both of those import IT, and the
// arrow has to keep pointing one way for the same reason engine.ts is
// forbidden from importing duel.ts.
//
// EVERY CALL IS BEST-EFFORT. Conduct evidence is a nice-to-have; grading a
// round correctly is not. If the write fails, the round still resolves.

export const CONDUCT_SURFACES = {
  intrusion: "intrusion",
  trace: "trace",
  duelAttacker: "duel_attacker",
  duelDefender: "duel_defender",
} as const;

export type ConductSurface =
  (typeof CONDUCT_SURFACES)[keyof typeof CONDUCT_SURFACES];

export const CONDUCT_SURFACE_LABELS: Record<string, string> = {
  intrusion: "INTRUSION LADDER",
  trace: "RAISA TRACE",
  duel_attacker: "DUEL — INTRUDER SEAT",
  duel_defender: "DUEL — OFFICER SEAT",
};

type RecordInput = ScoreInput & {
  userId: string;
  surface: ConductSurface;
  runId: string | null;
};

// Score one graded round and file the result.
//
// Returns the score so a caller that wants it (the intrusion ladder, which
// accumulates across a run) has it without a second read.
export async function recordConduct(input: RecordInput): Promise<number> {
  try {
    const { score, reasons } = scoreSubmission(input);

    await db.conductRecord.create({
      data: {
        userId: input.userId,
        surface: input.surface,
        game: input.game,
        runId: input.runId,
        elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
        correct: input.correct,
        score,
        reasons: JSON.stringify(reasons),
        // Capped again here even though the client caps it: the cap on that
        // side is a courtesy, this one is the guarantee.
        signals: input.rawSignals.slice(0, 400),
      },
    });

    void pruneConductSignals();
    return score;
  } catch {
    return 0;
  }
}

// Accumulate a run's conduct score and mark it for the desk past the
// threshold. Intrusion rounds only — a flagged OFFICER has no case file of
// their own to mark, and their records surface on /admin/conduct instead.
export async function accumulateRunSuspicion(
  runId: string,
  alreadyFlagged: boolean,
  score: number
): Promise<void> {
  if (score <= 0) return;
  try {
    const updated = await db.hackRun.update({
      where: { id: runId },
      data: { suspicionScore: { increment: score } },
      select: { suspicionScore: true, flagged: true },
    });

    if (alreadyFlagged || updated.flagged) return;
    if (updated.suspicionScore < SUSPICION_FLAG_SCORE) return;

    await db.hackRun.update({
      where: { id: runId },
      data: { flagged: true },
    });

    // The marker RAISA sees carries no identity and no reasons — only that
    // this case is worth a second look. The reasons are Admin+ only.
    await logAudit({
      action: AUDIT_ACTIONS.hackConductFlagged,
      actor: null,
      targetType: "hack_run",
      targetId: runId,
      targetName: caseCode(runId),
      summary: "Intrusion conduct marked for review — anomalous solve pattern",
    });
  } catch {
    /* best-effort */
  }
}

// Drop the bulky untrusted telemetry blob from old records, keeping the score
// and the reasons forever. Probability-gated because there is no cron here —
// same pattern as pruneHackChallenges and pruneAttempts.
export async function pruneConductSignals(probability = 0.05): Promise<void> {
  if (Math.random() > probability) return;
  try {
    const cutoff = new Date(Date.now() - CONDUCT_SIGNAL_RETENTION_MS);
    await db.conductRecord.updateMany({
      where: { createdAt: { lt: cutoff }, signals: { not: "" } },
      data: { signals: "" },
    });
  } catch {
    /* pruning is best-effort */
  }
}
