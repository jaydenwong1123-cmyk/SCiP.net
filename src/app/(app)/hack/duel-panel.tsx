"use client";

import { useCallback, useTransition } from "react";
import { GameSurface, useRoundInput } from "./games";
import { Countdown } from "./countdown";
import { pollDuelAction, submitDuelAnswerAction, type HackActionState } from "./actions";
import type { PublicDuel } from "@/lib/hack/duel";

// The intruder's side of the counter-intrusion duel.
//
// A RAISA officer caught this run while it was live and is now looking at the
// exact same puzzle on the exact same clock. First correct answer takes it:
// win and the run extracts at Layer 3 access or better, lose and it dies here
// with every banked tier forfeit.
//
// There is no ABORT and no CHECK. The duel is not declinable — that is the
// whole threat of it — and a free preview in a race is simply an extra guess.
export function DuelPanel({
  duel,
  feedback,
  error,
  onDone,
}: {
  duel: PublicDuel;
  feedback?: string;
  error: string | null;
  onDone: (state: HackActionState) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [answer, setAnswer] = useRoundInput(duel.nonce);

  const submit = useCallback(() => {
    if (pending) return;
    const form = new FormData();
    form.set("nonce", duel.nonce);
    form.set("answer", answer);
    startTransition(async () => onDone(await submitDuelAnswerAction(null, form)));
  }, [duel.nonce, answer, pending, onDone]);

  return (
    <div className="term-panel alert-panel space-y-3">
      <div className="alert-stripe" />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm tracking-widest text-[var(--term-red)]">
          :: COUNTER-INTRUSION DETECTED ::
        </h2>
        <span className="text-xs text-[var(--term-fg-dim)]">
          {duel.attemptsLeft} ATTEMPT{duel.attemptsLeft === 1 ? "" : "S"}
        </span>
      </div>

      <p className="text-xs text-[var(--term-amber)] leading-snug">
        {duel.opponent} IS ON THIS TERMINAL AND HAS THIS EXACT PUZZLE. FIRST
        CORRECT ANSWER DECIDES THE RUN. BEAT THEM AND YOU EXTRACT AT L-4 OR
        BETTER — LOSE AND EVERYTHING BANKED IS GONE.
      </p>

      <Countdown
        key={duel.nonce}
        deadlineMs={duel.deadlineMs}
        serverNowMs={duel.serverNowMs}
        label="SEC — RACING THE DESK"
        // The clock running out does not settle a duel on its own; the server
        // does that. Poll once so whatever it decided lands on screen.
        onExpire={() => void pollDuelAction().then(onDone)}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div>
          <h3 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
            {duel.label}
          </h3>
          <p className="text-xs text-[var(--term-fg-dim)] leading-snug">
            {duel.brief}
          </p>
        </div>

        <GameSurface
          game={duel.game}
          payload={duel.payload}
          value={answer}
          onChange={setAnswer}
          disabled={pending}
        />

        {feedback && <p className="text-sm text-[var(--term-amber)]">{feedback}</p>}
        {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}

        <button type="submit" disabled={pending} className="term-button">
          {pending ? "TRANSMITTING..." : "[ TRANSMIT ]"}
        </button>
      </form>
    </div>
  );
}
