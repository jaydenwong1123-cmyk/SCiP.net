"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GameSurface, useRoundInput } from "./games";
import { Countdown } from "./countdown";
import { DuelPanel } from "./duel-panel";
import {
  abortHackRunAction,
  checkHackAnswerAction,
  extractHackRunAction,
  pollDuelAction,
  pushDeeperAction,
  submitHackAnswerAction,
  type HackActionState,
} from "./actions";
import type { PublicChallenge } from "@/lib/hack/engine";
import type { PublicDuel } from "@/lib/hack/duel";

// How often the console asks whether RAISA has engaged it.
//
// There is no realtime transport in this deployment, so this poll is the only
// way an intruder learns they are being hunted. Deliberately slower than it
// could be: DUEL_ROUND_MS is sized so that up to one interval of discovery
// latency can never be what decided a duel, and the attacker's own clock does
// not start until this poll delivers the puzzle.
const DUEL_POLL_MS = 4000;

type Phase =
  | { kind: "challenge"; challenge: PublicChallenge; feedback?: string }
  | { kind: "duel"; duel: PublicDuel; feedback?: string }
  | { kind: "checkpoint" }
  | { kind: "failed"; reason: string }
  | { kind: "extracted" };

type Props = {
  initial: PublicChallenge | null;
  // Set when the page loaded into an already-open duel — a reload mid-duel, or
  // an officer who engaged between the last render and this one.
  initialDuel: PublicDuel | null;
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
  initialDuel,
  atCheckpoint,
  stage,
  clearedStages,
  tierLabels,
  maxStage,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>(
    // A live duel outranks everything else: it has suspended the ladder and it
    // is about to end the run one way or the other.
    initialDuel
      ? { kind: "duel", duel: initialDuel }
      : atCheckpoint
        ? { kind: "checkpoint" }
        : initial
          ? { kind: "challenge", challenge: initial }
          : { kind: "failed", reason: "NO ACTIVE INTRUSION" }
  );
  const [error, setError] = useState<string | null>(null);

  // Tracked locally rather than read straight from props: `stage` and
  // `clearedStages` are only as fresh as the last full page load, but the
  // console advances rounds, checkpoints and stages entirely inside client
  // transitions (see `apply` below) without ever asking the server component
  // to re-render. Without this, the stage bar and the checkpoint banner would
  // freeze at whatever stage the page happened to load on.
  const [curStage, setCurStage] = useState(stage);
  const [curCleared, setCurCleared] = useState(clearedStages);

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
      // A poll that found nothing must not clear an error the player is still
      // reading, nor disturb the phase they are mid-puzzle on.
      if (state.kind === "idle") return;
      setError(null);
      setCheckFeedback(null);
      switch (state.kind) {
        case "challenge":
          setPhase({
            kind: "challenge",
            challenge: state.challenge,
            feedback: state.feedback,
          });
          setCurStage(state.challenge.stage);
          break;
        case "duel":
          setPhase({ kind: "duel", duel: state.duel, feedback: state.feedback });
          break;
        case "checkpoint":
          setPhase({ kind: "checkpoint" });
          // The stage that was just cleared is whatever the console was
          // running on the instant its last round graded — `curStage` here,
          // not the (possibly stale) prop.
          setCurCleared(curStage);
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
    [router, curStage]
  );

  // Ask the server whether a RAISA officer has engaged this run.
  //
  // Runs only while the intrusion is still live, and stops the moment the run
  // reaches a terminal phase or a duel takes over — once the duel is on screen
  // its own panel owns the exchange.
  useEffect(() => {
    if (phase.kind !== "challenge" && phase.kind !== "checkpoint") return;
    const id = setInterval(() => {
      void pollDuelAction().then(apply);
    }, DUEL_POLL_MS);
    return () => clearInterval(id);
  }, [phase.kind, apply]);

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
        stage={curStage}
        maxStage={maxStage}
        clearedStages={curCleared}
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
              {phase.challenge.game === "icebreaker" && (
                <button
                  type="button"
                  onClick={check}
                  disabled={pending || checkPending}
                  className="term-button"
                >
                  {checkPending ? "CHECKING..." : "[ CHECK ]"}
                </button>
              )}
              <button type="submit" disabled={pending} className="term-button">
                {pending ? "TRANSMITTING..." : "[ TRANSMIT ]"}
              </button>
              <AbortButton onDone={apply} />
            </div>
          </form>
        </div>
      )}

      {phase.kind === "duel" && (
        <DuelPanel
          duel={phase.duel}
          feedback={phase.feedback}
          error={error}
          onDone={apply}
        />
      )}

      {phase.kind === "checkpoint" && (
        <Checkpoint
          stage={curCleared}
          maxStage={maxStage}
          tierLabel={tierLabels[curCleared - 1] ?? "?"}
          nextTierLabel={tierLabels[curCleared] ?? null}
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
            CLEARANCE {tierLabels[curCleared - 1] ?? "?"} GRANTED. READ ACCESS ONLY.
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
