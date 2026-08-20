"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GameSurface, useRoundInput } from "../hack/games";
import {
  beginTraceAction,
  checkTraceAnswerAction,
  submitTraceAnswerAction,
  type TraceState,
} from "./actions";
import type { PublicChallenge } from "@/lib/hack/engine";
import { useRoundTelemetry } from "@/lib/hack/telemetry";
import { OffTerminalNotice } from "@/components/off-terminal-notice";

// RAISA's trace console.
//
// Same engine, same twelve renderers, gentler settings: one round per reveal,
// drawn from the shallow end of the registry with a slack clock. Their job is
// oversight, not a gauntlet — the intruder is the one meant to sweat.
export function TraceConsole({
  runId,
  revealLevel,
  revealMax,
  // Preformatted on the server. The backoff is wall-clock state, and reading
  // the clock during a client render is both impure and pointless — the page
  // re-renders on every trace outcome anyway.
  lockedNotice,
}: {
  runId: string;
  revealLevel: number;
  revealMax: number;
  lockedNotice: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [challenge, setChallenge] = useState<PublicChallenge | null>(null);
  const [notice, setNotice] = useState<string | null>(lockedNotice);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useRoundInput(challenge?.nonce ?? "");
  const [checkPending, startCheckTransition] = useTransition();
  const [checkFeedback, setCheckFeedback] = useState<string | null>(null);
  // The desk is held to the same conduct standard as the people it
  // investigates. An officer who solves a trace faster than it can be read is
  // buying somebody's identity with a language model, and that belongs in the
  // conduct log exactly as an intruder doing it does.
  const telemetry = useRoundTelemetry(challenge?.nonce ?? "");

  const apply = useCallback(
    (state: TraceState) => {
      if (!state.ok) {
        setError(state.error);
        if (state.resync) router.refresh();
        return;
      }
      setError(null);
      setCheckFeedback(null);
      switch (state.kind) {
        case "challenge":
          setNotice(null);
          setChallenge(state.challenge);
          break;
        case "locked":
          setChallenge(null);
          setNotice(state.reason);
          router.refresh();
          break;
        case "revealed":
          setChallenge(null);
          setNotice(
            state.revealLevel >= revealMax
              ? "OPERATOR IDENTIFIED."
              : `FIELD UNCOVERED — TRACE ${state.revealLevel}/${revealMax}.`
          );
          router.refresh();
          break;
      }
    },
    [router, revealMax]
  );

  if (revealLevel >= revealMax) {
    return (
      <p className="text-sm text-[var(--term-fg-bright)]">
        TRACE COMPLETE. OPERATOR IDENTIFIED.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {notice && <p className="text-sm text-[var(--term-amber)]">{notice}</p>}
      {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}

      {!challenge ? (
        <button
          className="term-button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => apply(await beginTraceAction(runId)))
          }
        >
          {pending ? "OPENING TRACE..." : "[ BEGIN TRACE ]"}
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData();
            form.set("nonce", challenge.nonce);
            form.set("answer", answer);
            form.set("signals", telemetry.snapshot());
            startTransition(async () =>
              apply(await submitTraceAnswerAction(null, form))
            );
          }}
          className="space-y-3"
          {...telemetry.guardProps}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
              {challenge.label}
            </h3>
            <span className="text-xs text-[var(--term-fg-dim)]">
              TRACE {revealLevel + 1}/{revealMax}
            </span>
          </div>
          <p className="text-xs text-[var(--term-fg-dim)] leading-snug">
            {challenge.brief}
          </p>
          <OffTerminalNotice ms={telemetry.offTerminalMs} />
          <GameSurface
            game={challenge.game}
            payload={challenge.payload}
            value={answer}
            onChange={(v) => {
              setCheckFeedback(null);
              setAnswer(v);
            }}
            disabled={pending}
            signals={telemetry.signals}
          />
          {checkFeedback && (
            <p className="text-sm text-[var(--term-fg-bright)]">{checkFeedback}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {challenge.game === "icebreaker" && (
              <button
                type="button"
                disabled={pending || checkPending}
                className="term-button"
                onClick={() => {
                  if (!challenge || pending || checkPending) return;
                  const form = new FormData();
                  form.set("nonce", challenge.nonce);
                  form.set("answer", answer);
                  startCheckTransition(async () => {
                    const result = await checkTraceAnswerAction(null, form);
                    setCheckFeedback(result.ok ? result.feedback : result.error);
                  });
                }}
              >
                {checkPending ? "CHECKING..." : "[ CHECK ]"}
              </button>
            )}
            <button type="submit" disabled={pending} className="term-button">
              {pending ? "RESOLVING..." : "[ RESOLVE ]"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
