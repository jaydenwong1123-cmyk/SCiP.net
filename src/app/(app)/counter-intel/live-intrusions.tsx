"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { engageDuelAction, pollDuelAction } from "./actions";
import { DuelConsole } from "./duel-console";
import type { DuelState, PublicDuel } from "@/lib/hack/duel";

export type LiveCase = {
  runId: string;
  code: string;
  startedLabel: string;
  clearedStages: number;
  // "none"  — nobody has engaged it
  // "mine"  — this officer engaged it and the duel is still running
  // "other" — another officer holds it
  engagement: "none" | "mine" | "other";
  engagedByName: string | null;
};

// Intrusions happening RIGHT NOW, and the button that turns one into a duel.
//
// Every case here is anonymous — the list is built from run ids alone, and the
// only name it ever shows is a RAISA officer's. A case the viewing officer
// started themselves is filtered out server-side rather than disabled here,
// so an officer who is also the intruder cannot identify their own case code
// by looking for the row that refuses to engage.
export function LiveIntrusions({ cases }: { cases: LiveCase[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState<{ runId: string; duel: PublicDuel } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const enter = useCallback(
    (runId: string, state: DuelState) => {
      if (!state.ok) {
        setError(state.error);
        if (state.resync) router.refresh();
        return;
      }
      setError(null);
      if (state.kind === "live") {
        setActive({ runId, duel: state.duel });
      } else {
        // Already settled while the list was on screen.
        router.refresh();
      }
    },
    [router]
  );

  if (active) {
    return (
      <DuelConsole
        runId={active.runId}
        initial={active.duel}
        onSettled={() => setActive(null)}
      />
    );
  }

  if (cases.length === 0) return null;

  return (
    <div className="term-panel space-y-2">
      <h2 className="text-sm tracking-widest text-[var(--term-amber)]">
        LIVE INTRUSIONS
      </h2>
      <p className="text-xs text-[var(--term-fg-dim)]">
        ENGAGING SERVES YOU AND THE OPERATOR THE SAME PUZZLE. FIRST CORRECT
        ANSWER DECIDES THE RUN — WIN AND THE BREACH IS REPELLED, LOSE AND THEY
        SEIZE LAYER 3 ACCESS AND THIS CASE LOCKS FOR THE TRACE BACKOFF.
      </p>

      {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}

      <ul className="space-y-1 pt-1">
        {cases.map((item) => (
          <li
            key={item.runId}
            className="flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span>
              <span className="text-[var(--term-fg-bright)]">{item.code}</span>
              <span className="text-[var(--term-fg-dim)]">
                {" "}
                · {item.startedLabel} · {item.clearedStages} LAYER
                {item.clearedStages === 1 ? "" : "S"} BREACHED
              </span>
            </span>

            {item.engagement === "other" ? (
              <span className="text-[var(--term-fg-dim)]">
                ENGAGED — {item.engagedByName ?? "ANOTHER OFFICER"}
              </span>
            ) : (
              <button
                type="button"
                disabled={pending}
                className="term-button hack-button--risk text-xs"
                onClick={() =>
                  startTransition(async () =>
                    enter(
                      item.runId,
                      item.engagement === "mine"
                        ? await pollDuelAction(item.runId)
                        : await engageDuelAction(item.runId)
                    )
                  )
                }
              >
                {pending
                  ? "..."
                  : item.engagement === "mine"
                    ? "[ RESUME DUEL ]"
                    : "[ ENGAGE ]"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
