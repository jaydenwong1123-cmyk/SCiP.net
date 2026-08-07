"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { engageDuelAction, pollDuelAction } from "./actions";
import { DuelConsole } from "./duel-console";
import type { DuelState, PublicDuel } from "@/lib/hack/duel";
import { HudPanel, Lamp } from "@/components/hud";

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

  // The feed keeps its place on the watch floor when quiet. A panel that
  // disappears when nothing is happening makes an idle desk indistinguishable
  // from a broken one.
  if (cases.length === 0) {
    return (
      <HudPanel code="01" title="LIVE INTRUSION FEED" status="NO CONTACTS">
        <div className="empty-state">
          <span className="empty-state__glyph" aria-hidden>
            ◇
          </span>
          <p className="empty-state__title">PERIMETER QUIET</p>
          <p className="text-[10px]">NO INTRUSION IN PROGRESS</p>
        </div>
      </HudPanel>
    );
  }

  return (
    <HudPanel
      code="01"
      title={<span className="text-[var(--term-amber)]">LIVE INTRUSION FEED</span>}
      status={`${cases.length} CONTACT${cases.length === 1 ? "" : "S"}`}
      variant="alert"
    >
      <p className="text-[10px] text-[var(--term-fg-dim)] leading-snug mb-2">
        ENGAGING SERVES YOU AND THE OPERATOR THE SAME PUZZLE. FIRST CORRECT
        ANSWER DECIDES THE RUN — WIN AND THE BREACH IS REPELLED, LOSE AND THEY
        SEIZE LAYER 3 ACCESS AND THIS CASE LOCKS FOR THE TRACE BACKOFF.
      </p>

      {error && <p className="text-sm text-[var(--term-red)] mb-2">{error}</p>}

      <ul className="hud-list">
        {cases.map((item) => (
          <li
            key={item.runId}
            className="term-row flex flex-wrap items-center justify-between gap-2 text-xs"
          >
            <span className="flex items-center gap-2 min-w-0 flex-wrap">
              <Lamp state="alert">LIVE</Lamp>
              <span className="text-[var(--term-fg-bright)]">{item.code}</span>
              <span className="hud-recid">
                {item.startedLabel} · {item.clearedStages} LAYER
                {item.clearedStages === 1 ? "" : "S"} BREACHED
              </span>
            </span>

            {item.engagement === "other" ? (
              <span className="hud-lamp hud-lamp--off">
                ENGAGED — {item.engagedByName ?? "ANOTHER OFFICER"}
              </span>
            ) : (
              <button
                type="button"
                disabled={pending}
                className="term-button term-button--danger term-button--sm"
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
                    ? "RESUME DUEL"
                    : "ENGAGE"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </HudPanel>
  );
}
