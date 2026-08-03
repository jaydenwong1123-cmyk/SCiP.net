"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { beginHackRunAction } from "./actions";

// The confirm gate on the warning screen.
//
// Two-step on purpose: the first press only arms the control. Starting a run
// burns the daily attempt whether or not the member meant to press it, so a
// stray click on a page whose whole job is to warn them would be a poor joke.
export function BreachForm() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!armed) {
    return (
      <div className="space-y-2">
        <button onClick={() => setArmed(true)} className="term-button">
          [ ACKNOWLEDGE ]
        </button>
        <p className="text-xs text-[var(--term-fg-dim)]">
          READ THE NOTICE ABOVE BEFORE PROCEEDING.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() =>
          startTransition(async () => {
            const state = await beginHackRunAction();
            if (!state.ok) setError(state.error);
            // The page re-reads the run and mounts the console. Refreshing
            // rather than holding the first challenge in state keeps a single
            // source of truth for what the run currently is.
            else router.refresh();
          })
        }
        disabled={pending}
        className="term-button hack-button--risk"
      >
        {pending ? "OPENING LINK..." : "[ CONFIRM BREACH — BURNS TODAY'S ATTEMPT ]"}
      </button>
      {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}
      <button
        onClick={() => setArmed(false)}
        disabled={pending}
        className="term-link text-xs block"
      >
        [ STAND DOWN ]
      </button>
    </div>
  );
}
