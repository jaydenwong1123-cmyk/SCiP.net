"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GameSurface, useRoundInput } from "./games";
import {
  abortHackRunAction,
  checkHackAnswerAction,
  extractHackRunAction,
  pushDeeperAction,
  submitHackAnswerAction,
  type HackActionState,
} from "./actions";
import type { PublicChallenge } from "@/lib/hack/engine";

type Phase =
  | { kind: "challenge"; challenge: PublicChallenge; feedback?: string }
  | { kind: "checkpoint" }
  | { kind: "failed"; reason: string }
  | { kind: "extracted" };

type Props = {
  initial: PublicChallenge | null;
  atCheckpoint: boolean;
  stage: number;
  clearedStages: number;
  tierLabels: string[];
  maxStage: number;
};

// The intrusion console.
//
// It renders a countdown and a puzzle, and it forwards a string. Every decision
// — right or wrong, in time or not, advance or fail — is made on the server.
// The timer here is presentation: when it reaches zero the console stops
// accepting input, but a submission that slips through is rejected by the
// server's own deadline check anyway.
export function RunConsole({
  initial,
  atCheckpoint,
  stage,
  clearedStages,
  tierLabels,
  maxStage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>(
    atCheckpoint
      ? { kind: "checkpoint" }
      : initial
        ? { kind: "challenge", challenge: initial }
        : { kind: "failed", reason: "NO ACTIVE INTRUSION" }
  );
  const [error, setError] = useState<string | null>(null);

  const challenge = phase.kind === "challenge" ? phase.challenge : null;
  const [answer, setAnswer] = useRoundInput(challenge?.nonce ?? "");
  const [checkPending, startCheckTransition] = useTransition();
  const [checkFeedback, setCheckFeedback] = useState<string | null>(null);

  const apply = useCallback(
    (state: HackActionState) => {
      if (!state.ok) {
        setError(state.error);
        // A stale challenge means our view of the run is behind the server's.
        // Re-read rather than guess at what changed.
        if (state.resync) router.refresh();
        return;
      }
      setError(null);
      setCheckFeedback(null);
      switch (state.kind) {
        case "challenge":
          setPhase({
            kind: "challenge",
            challenge: state.challenge,
            feedback: state.feedback,
          });
          break;
        case "checkpoint":
          setPhase({ kind: "checkpoint" });
          break;
        case "failed":
          setPhase({ kind: "failed", reason: state.reason });
          break;
        case "extracted":
          setPhase({ kind: "extracted" });
          router.refresh();
          break;
      }
    },
    [router]
  );

  const submit = useCallback(() => {
    if (!challenge || pending) return;
    setCheckFeedback(null);
    const form = new FormData();
    form.set("nonce", challenge.nonce);
    form.set("answer", answer);
    startTransition(async () => {
      apply(await submitHackAnswerAction(null, form));
    });
  }, [challenge, answer, pending, apply]);

  // A preview, not a submission: burns no attempt and never advances the
  // round. Separate from TRANSMIT so a player can see how close a guess is
  // (e.g. icebreaker's letters-correct count) without risking anything.
  const check = useCallback(() => {
    if (!challenge || pending || checkPending) return;
    const form = new FormData();
    form.set("nonce", challenge.nonce);
    form.set("answer", answer);
    startCheckTransition(async () => {
      const result = await checkHackAnswerAction(null, form);
      setCheckFeedback(result.ok ? (result.feedback ?? null) : (result.error ?? null));
    });
  }, [challenge, answer, pending, checkPending]);

  return (
    <div className="space-y-4">
      <StageBar
        stage={stage}
        maxStage={maxStage}
        clearedStages={clearedStages}
        tierLabels={tierLabels}
      />

      {phase.kind === "challenge" && (
        <div className="term-panel space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
              {phase.challenge.label}
            </h2>
            <span className="text-xs text-[var(--term-fg-dim)]">
              ROUND {phase.challenge.round}/{phase.challenge.rounds}
              {phase.challenge.attemptsLeft > 1 &&
                ` · ${phase.challenge.attemptsLeft} ATTEMPTS`}
            </span>
          </div>

          <Countdown
            key={phase.challenge.nonce}
            deadlineMs={phase.challenge.deadlineMs}
            serverNowMs={phase.challenge.serverNowMs}
            onExpire={() => router.refresh()}
          />

          <p className="text-xs text-[var(--term-fg-dim)] leading-snug">
            {phase.challenge.brief}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-3"
          >
            <GameSurface
              game={phase.challenge.game}
              payload={phase.challenge.payload}
              value={answer}
              onChange={(v) => {
                setCheckFeedback(null);
                setAnswer(v);
              }}
              disabled={pending}
            />

            {phase.feedback && (
              <p className="text-sm text-[var(--term-amber)]">{phase.feedback}</p>
            )}
            {checkFeedback && (
              <p className="text-sm text-[var(--term-fg-bright)]">{checkFeedback}</p>
            )}
            {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={check}
                disabled={pending || checkPending}
                className="term-button"
              >
                {checkPending ? "CHECKING..." : "[ CHECK ]"}
              </button>
              <button type="submit" disabled={pending} className="term-button">
                {pending ? "TRANSMITTING..." : "[ TRANSMIT ]"}
              </button>
              <AbortButton onDone={apply} />
            </div>
          </form>
        </div>
      )}

      {phase.kind === "checkpoint" && (
        <Checkpoint
          stage={stage}
          maxStage={maxStage}
          tierLabel={tierLabels[clearedStages - 1] ?? "?"}
          nextTierLabel={tierLabels[clearedStages] ?? null}
          pending={pending}
          error={error}
          onExtract={() =>
            startTransition(async () => apply(await extractHackRunAction()))
          }
          onPush={() =>
            startTransition(async () => apply(await pushDeeperAction()))
          }
        />
      )}

      {phase.kind === "failed" && (
        <div className="term-panel alert-panel space-y-2">
          <div className="alert-stripe" />
          <h2 className="text-sm tracking-widest text-[var(--term-red)]">
            :: INTRUSION REPELLED ::
          </h2>
          <p className="text-sm">{phase.reason}</p>
          <p className="text-xs text-[var(--term-fg-dim)]">
            ALL BANKED TIERS FORFEIT. COUNTERMEASURE COOLDOWN EXTENDED.
          </p>
          <button onClick={() => router.refresh()} className="term-button">
            [ DISCONNECT ]
          </button>
        </div>
      )}

      {phase.kind === "extracted" && (
        <div className="term-panel space-y-2">
          <h2 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
            :: EXTRACTION COMPLETE ::
          </h2>
          <p className="text-sm">
            CLEARANCE {tierLabels[clearedStages - 1] ?? "?"} GRANTED. READ ACCESS ONLY.
          </p>
          <button onClick={() => router.refresh()} className="term-button">
            [ CLOSE LINK ]
          </button>
        </div>
      )}
    </div>
  );
}

function StageBar({
  stage,
  maxStage,
  clearedStages,
  tierLabels,
}: {
  stage: number;
  maxStage: number;
  clearedStages: number;
  tierLabels: string[];
}) {
  return (
    <div className="term-panel flex flex-wrap items-center gap-2 text-xs">
      {Array.from({ length: maxStage }, (_, i) => {
        const n = i + 1;
        const state =
          n <= clearedStages ? "done" : n === stage ? "active" : "locked";
        return (
          <span
            key={n}
            className={`hack-stage hack-stage--${state}`}
            aria-label={`Stage ${n} ${state}`}
          >
            {n}:{tierLabels[i]}
          </span>
        );
      })}
    </div>
  );
}

// Countdown.
//
// Rendered from the server's own clock: `serverNowMs` was captured alongside
// `deadlineMs`, so the difference between it and the local clock is a known
// offset that can be subtracted. A player who winds their OS clock forward
// therefore sees an unchanged timer, and one who winds it back gains nothing —
// the server re-checks the deadline on submit regardless.
function Countdown({
  deadlineMs,
  serverNowMs,
  onExpire,
}: {
  deadlineMs: number;
  serverNowMs: number;
  onExpire: () => void;
}) {
  // Seeded from the server's own budget rather than from the local clock, so
  // the first paint is correct without reading Date.now() during render.
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadlineMs - serverNowMs)
  );
  const fired = useRef(false);
  // Kept in a ref rather than a dependency: `onExpire` is an inline callback
  // that gets a new identity on every keystroke elsewhere in the tree, and
  // this effect must not tear down and restart (which would reset the timer)
  // just because unrelated state changed.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    // Offset between this browser's clock and the server's, measured once on
    // mount. Subtracting it means a player who winds their OS clock forward
    // sees an unchanged timer — and the server re-checks the deadline on
    // submit regardless, so the display is never load-bearing.
    const skew = Date.now() - serverNowMs;
    const tick = () => {
      const left = Math.max(0, deadlineMs - (Date.now() - skew));
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadlineMs, serverNowMs]);

  const seconds = remaining / 1000;
  const critical = seconds <= 5;

  return (
    <div
      className={`hack-timer${critical ? " hack-timer--critical" : ""}`}
      role="timer"
      aria-live="off"
    >
      <span className="tabular-nums">{seconds.toFixed(1)}</span>
      <span className="text-[var(--term-fg-dim)]"> SEC TO TRACE</span>
    </div>
  );
}

function Checkpoint({
  stage,
  maxStage,
  tierLabel,
  nextTierLabel,
  pending,
  error,
  onExtract,
  onPush,
}: {
  stage: number;
  maxStage: number;
  tierLabel: string;
  nextTierLabel: string | null;
  pending: boolean;
  error: string | null;
  onExtract: () => void;
  onPush: () => void;
}) {
  return (
    <div className="term-panel space-y-3">
      <h2 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
        :: LAYER {stage} BREACHED ::
      </h2>
      <p className="text-sm">
        BANKED: <span className="text-[var(--term-fg-bright)]">{tierLabel}</span> READ ACCESS.
      </p>
      {stage < maxStage && nextTierLabel ? (
        <p className="text-xs text-[var(--term-amber)]">
          PUSHING DEEPER RISKS EVERYTHING BANKED. FAILURE FORFEITS ALL TIERS AND
          EXTENDS THE COOLDOWN. NEXT LAYER PAYS {nextTierLabel}.
        </p>
      ) : (
        <p className="text-xs text-[var(--term-fg-dim)]">
          DEEPEST LAYER REACHED. NOTHING FURTHER TO BREACH.
        </p>
      )}
      {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button onClick={onExtract} disabled={pending} className="term-button">
          {pending ? "..." : `[ EXTRACT — BANK ${tierLabel} ]`}
        </button>
        {stage < maxStage && (
          <button
            onClick={onPush}
            disabled={pending}
            className="term-button hack-button--risk"
          >
            {pending ? "..." : "[ PUSH DEEPER ]"}
          </button>
        )}
      </div>
    </div>
  );
}

function AbortButton({ onDone }: { onDone: (s: HackActionState) => void }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="term-button text-xs"
      >
        [ ABORT ]
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => onDone(await abortHackRunAction()))
      }
      className="term-button hack-button--risk text-xs"
    >
      {pending ? "..." : "[ CONFIRM ABORT — FORFEITS RUN ]"}
    </button>
  );
}
