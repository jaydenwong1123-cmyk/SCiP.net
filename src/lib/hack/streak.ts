import { db } from "@/lib/db";
import { RUN_STATUS } from "./config";

// A run only counts once it has landed on one of the two terminal outcomes —
// "active" is still in flight and "abandoned" is folded into failure, same as
// the cooldown penalty in lib/hack/engine.ts already treats it.
type Outcome = "success" | "failure";

export type HackStreak = {
  // Length of the run currently sitting at the front of history, signed by
  // kind via `currentKind`. Zero (kind null) means no resolved runs yet.
  current: number;
  currentKind: Outcome | null;
  bestSuccess: number;
  bestFailure: number;
};

const EMPTY_STREAK: HackStreak = {
  current: 0,
  currentKind: null,
  bestSuccess: 0,
  bestFailure: 0,
};

// Newest-first scan of a member's own resolved intrusions. One query, then a
// single linear pass — cheap enough to run on every /hack page load and never
// worth caching given how rarely a member's own run history changes.
export async function hackStreakForUser(userId: string): Promise<HackStreak> {
  const runs = await db.hackRun.findMany({
    where: {
      userId,
      status: { in: [RUN_STATUS.extracted, RUN_STATUS.failed, RUN_STATUS.abandoned] },
    },
    orderBy: { startedAt: "desc" },
    select: { status: true },
  });

  if (runs.length === 0) return EMPTY_STREAK;

  let current = 0;
  let currentKind: Outcome | null = null;
  let currentBroken = false;

  let bestSuccess = 0;
  let bestFailure = 0;
  let runLen = 0;
  let runKind: Outcome | null = null;

  for (const run of runs) {
    const kind: Outcome = run.status === RUN_STATUS.extracted ? "success" : "failure";

    // The leading streak stops growing the instant the kind breaks, but the
    // scan keeps going below so the best-ever counters still see the rest of
    // history.
    if (!currentBroken) {
      if (currentKind === null) {
        currentKind = kind;
        current = 1;
      } else if (kind === currentKind) {
        current++;
      } else {
        currentBroken = true;
      }
    }

    if (kind === runKind) {
      runLen++;
    } else {
      runKind = kind;
      runLen = 1;
    }
    if (runKind === "success") bestSuccess = Math.max(bestSuccess, runLen);
    else bestFailure = Math.max(bestFailure, runLen);
  }

  return { current, currentKind, bestSuccess, bestFailure };
}
