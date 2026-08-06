"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GameSurface, useRoundInput } from "../hack/games";
import { Countdown } from "../hack/countdown";
import { pollDuelAction, submitDuelAnswerAction } from "./actions";
import type { DuelState, PublicDuel } from "@/lib/hack/duel";

type Phase =
  | { kind: "live"; duel: PublicDuel; feedback?: string }
  | { kind: "won" }
  | { kind: "lost"; reason: string };

// RAISA's side of the counter-intrusion duel.
//
// The same puzzle the intruder is looking at, on the same clock, with the same
// three attempts. Whoever transmits a correct answer first takes it: win and
// the breach is repelled on the spot, lose and the operator walks off with
// Layer 3 access and this case locks the officer out for the trace backoff.
//
// The opponent is shown as a case code and never a name — engaging an intruder
// does not shortcut the reveal ladder, and an officer who wins a duel still
// has no idea who they beat.
export function DuelConsole({
  runId,
  initial,
  onSettled,
}: {
  runId: string;
  initial: PublicDuel;
  onSettled?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>({ kind: "live", duel: initial });
  const [error, setError] = useState<string | null>(null);

  const duel = phase.kind === "live" ? phase.duel : null;
  const [answer, setAnswer] = useRoundInput(duel?.nonce ?? "");

  const apply = useCallback(
    (state: DuelState) => {
      if (!state.ok) {
        setError(state.error);
        if (state.resync) router.refresh();
        return;
      }
      setError(null);
      switch (state.kind) {
        case "live":
          setPhase({ kind: "live", duel: state.duel });
          break;
        case "wrong":
          setPhase({ kind: "live", duel: state.duel, feedback: state.feedback });
          break;
        case "won":
          setPhase({ kind: "won" });
          onSettled?.();
          router.refresh();
          break;
        case "lost":
          setPhase({ kind: "lost", reason: state.reason });
          onSettled?.();
          router.refresh();
          break;
        case "none":
          // The duel row is gone (the case was purged mid-duel). Nothing left
          // to render against; let the page reload decide what to show.
          router.refresh();
          break;
      }
    },
    [router, onSettled]
  );

  // The other seat is a human on another machine and there is no realtime
  // transport here, so the only way to learn they answered first is to ask.
  // Runs only while the duel is live and stops the moment it settles.
  useEffect(() => {
    if (phase.kind !== "live") return;
    const id = setInterval(() => {
      void pollDuelAction(runId).then(apply);
    }, 2000);
    return () => clearInterval(id);
  }, [phase.kind, runId, apply]);

  const submit = useCallback(() => {
    if (!duel || pending) return;
    const form = new FormData();
    form.set("nonce", duel.nonce);
    form.set("answer", answer);
    form.set("runId", runId);
    startTransition(async () => apply(await submitDuelAnswerAction(null, form)));
  }, [duel, answer, pending, runId, apply]);

  if (phase.kind === "won") {
    return (
      <div className="term-panel space-y-2">
        <h3 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
          :: BREACH CONTAINED ::
        </h3>
        <p className="text-sm">
          COUNTER-INTRUSION SUCCESSFUL. THE OPERATOR WAS REPELLED AND FORFEITS
          EVERY TIER THEY HAD BANKED.
        </p>
        <p className="text-xs text-[var(--term-fg-dim)]">
          THE CASE FILE REMAINS ANONYMOUS. RUN THE TRACE TO IDENTIFY THEM.
        </p>
      </div>
    );
  }

  if (phase.kind === "lost") {
    return (
      <div className="term-panel alert-panel space-y-2">
        <div className="alert-stripe" />
        <h3 className="text-sm tracking-widest text-[var(--term-red)]">
          :: CONTAINMENT FAILED ::
        </h3>
        <p className="text-sm">{phase.reason}</p>
        <p className="text-xs text-[var(--term-fg-dim)]">
          THE OPERATOR SEIZED LAYER 3 ACCESS. THIS CASE IS TRACE-LOCKED WHILE
          THE BACKOFF RUNS.
        </p>
      </div>
    );
  }

  return (
    <div className="term-panel alert-panel space-y-3">
      <div className="alert-stripe" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm tracking-widest text-[var(--term-red)]">
          :: COUNTER-INTRUSION ENGAGED ::
        </h3>
        <span className="text-xs text-[var(--term-fg-dim)]">
          {phase.duel.opponent} · {phase.duel.attemptsLeft} ATTEMPT
          {phase.duel.attemptsLeft === 1 ? "" : "S"}
        </span>
      </div>

      <Countdown
        key={phase.duel.nonce}
        deadlineMs={phase.duel.deadlineMs}
        serverNowMs={phase.duel.serverNowMs}
        label="SEC — RACING THE OPERATOR"
        onExpire={() => void pollDuelAction(runId).then(apply)}
      />

      <p className="text-xs text-[var(--term-amber)] leading-snug">
        THE OPERATOR HAS THIS EXACT PUZZLE. FIRST CORRECT ANSWER DECIDES THE
        RUN.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div>
          <h4 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
            {phase.duel.label}
          </h4>
          <p className="text-xs text-[var(--term-fg-dim)] leading-snug">
            {phase.duel.brief}
          </p>
        </div>

        <GameSurface
          game={phase.duel.game}
          payload={phase.duel.payload}
          value={answer}
          onChange={setAnswer}
          disabled={pending}
        />

        {phase.feedback && (
          <p className="text-sm text-[var(--term-amber)]">{phase.feedback}</p>
        )}
        {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}

        {/* No CHECK button. A free preview would be an extra guess, and in a
            race an extra guess is the whole contest. */}
        <button type="submit" disabled={pending} className="term-button">
          {pending ? "TRANSMITTING..." : "[ TRANSMIT ]"}
        </button>
      </form>
    </div>
  );
}
