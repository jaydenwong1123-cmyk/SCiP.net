"use client";

import { formatOffTerminal } from "@/lib/hack/telemetry";

// "You have been looking somewhere else."
//
// Shown by all four puzzle consoles when a round has spent real time with the
// tab hidden or the window unfocused. It is a NOTICE, not a penalty: the clock
// is untouched, the round is still winnable, and nothing about it changes how
// the answer is graded.
//
// Saying it out loud is the point. The console is quietly recording this for
// the conduct log either way, and a countermeasure that watches you without
// telling you is a different and worse thing than one that does. A member on a
// second monitor sees why the terminal noticed; a member consulting a model in
// another window sees that it noticed.
const FLOOR_MS = 5000;

export function OffTerminalNotice({ ms }: { ms: number }) {
  if (ms < FLOOR_MS) return null;
  return (
    <p className="text-xs text-[var(--term-amber)]">
      LINK UNSTABLE — {formatOffTerminal(ms)} OFF-TERMINAL THIS ROUND
    </p>
  );
}
