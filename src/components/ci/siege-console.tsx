"use client";

import { useState, useTransition } from "react";
import { GameSurface, useRoundInput } from "@/app/(app)/hack/games";
import { Countdown } from "@/app/(app)/hack/countdown";
import { useRoundTelemetry } from "@/lib/hack/telemetry";
import type {
  PublicSiegeChallenge,
  PublicSystem,
  SiegeFeed,
  SubmitResult,
} from "@/lib/ci/siege-store";
import type { SiegePurpose, SiegeSide } from "@/lib/ci/config";
import { SiegeBoard } from "./siege-board";
import { formatClock, useNow, useSiegeFeed } from "./use-siege-feed";

// The siege console, for both seats. CI drains, RAISA restores; the server
// decides what each answer is worth, and this component only shows the board,
// deals the puzzle the server issued, and reports the answer back.

export type IssueState =
  | { ok: true; challenge: PublicSiegeChallenge; serverNow: number }
  | { ok: false; error: string };

type Props = {
  side: SiegeSide;
  initialFeed: SiegeFeed | null;
  issue: (system: string, purpose: SiegePurpose) => Promise<IssueState>;
  submit: (nonce: string, answer: string, signals: string) => Promise<SubmitResult>;
  abandon: (nonce: string) => Promise<void>;
};

export function SiegeConsole({ side, initialFeed, issue, submit, abandon }: Props) {
  const feed = useSiegeFeed(initialFeed);
  const now = useNow(feed?.serverNow ?? initialFeed?.serverNow);
  const [round, setRound] = useState<{ challenge: PublicSiegeChallenge; serverNow: number } | null>(
    null
  );
  const [message, setMessage] = useState<{ text: string; tone: "good" | "bad" | "info" } | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const challenge = round?.challenge ?? null;
  const [answer, setAnswer] = useRoundInput(challenge?.nonce ?? "");
  const telemetry = useRoundTelemetry(challenge?.nonce ?? "");

  const siege = feed?.active ?? null;
  const verb = side === "ci" ? "ATTACK" : "DEFEND";

  const deal = (system: string, purpose: SiegePurpose) => {
    startTransition(async () => {
      const state = await issue(system, purpose);
      if (!state.ok) {
        setMessage({ text: state.error, tone: "bad" });
        return;
      }
      setMessage(null);
      setRound({ challenge: state.challenge, serverNow: state.serverNow });
    });
  };

  const send = () => {
    if (!challenge || answer.trim() === "") return;
    startTransition(async () => {
      const result = await submit(challenge.nonce, answer, telemetry.snapshot());
      if (!result.ok) {
        setMessage({ text: result.error, tone: "bad" });
        return;
      }
      if (!result.settled) {
        setMessage({
          text: `${result.feedback ?? "INCORRECT."} ${result.attemptsLeft} ATTEMPT${
            result.attemptsLeft === 1 ? "" : "S"
          } LEFT.`,
          tone: "info",
        });
        setRound({
          challenge: { ...challenge, attemptsLeft: result.attemptsLeft },
          serverNow: round!.serverNow,
        });
        return;
      }
      const effect =
        result.delta === 0
          ? ""
          : side === "ci"
            ? result.delta < 0
              ? ` −${-result.delta} INTEGRITY.`
              : ` COUNTERMEASURES RESTORED +${result.delta}.`
            : ` +${result.delta} INTEGRITY.`;
      setMessage({
        text: `${result.correct ? "CORRECT." : "FAILED."}${effect}${result.note ? ` ${result.note}` : ""}`,
        tone: result.correct ? "good" : "bad",
      });
      setRound(null);
    });
  };

  const walkAway = () => {
    if (!challenge) return;
    startTransition(async () => {
      await abandon(challenge.nonce);
      setRound(null);
      setMessage({ text: "PUZZLE ABANDONED.", tone: "info" });
    });
  };

  const rowAction = (s: PublicSystem) => {
    if (!siege) return null;
    const blocked =
      side === "ci"
        ? s.fallen || (s.id === "mainframe" && !siege.mainframeOpen)
        : s.integrity >= s.max;
    return (
      <button
        type="button"
        className="term-button term-button--sm"
        disabled={pending || !!challenge || blocked}
        onClick={() => deal(s.id, "siege")}
      >
        [{verb}]
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {siege ? (
        <>
          <p className="text-sm">
            <span className="text-[var(--term-red)]">⚠ SIEGE IN PROGRESS</span> —{" "}
            {formatClock(siege.endsAt - now)} REMAINING
          </p>
          <SiegeBoard systems={siege.systems} mainframeOpen={siege.mainframeOpen} action={rowAction} />
        </>
      ) : side === "raisa" && feed && feed.locked.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-[var(--term-amber)]">
            SIEGE OVER. THESE SYSTEMS ARE STILL OFFLINE — CLEAR {feed.locked[0].restoreNeeded} RESTORE
            PUZZLES ON ONE TO BRING IT BACK EARLY.
          </p>
          <ul className="space-y-2">
            {feed.locked.map((l) => (
              <li key={l.id} className="ci-system flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {l.label} — {l.restoreProgress}/{l.restoreNeeded} —{" "}
                  <span className="text-[var(--term-fg-dim)]">
                    AUTO-RESTORES IN {formatClock(l.lockedUntil - now)}
                  </span>
                </span>
                <button
                  type="button"
                  className="term-button term-button--sm"
                  disabled={pending || !!challenge}
                  onClick={() => deal(l.id, "restore")}
                >
                  [RESTORE]
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-[var(--term-fg-dim)]">NO SIEGE IN PROGRESS. PERIMETER QUIET.</p>
      )}

      {message && (
        <p
          className={`text-sm ${
            message.tone === "good"
              ? "text-[var(--term-fg-bright)]"
              : message.tone === "bad"
                ? "text-[var(--term-red)]"
                : "text-[var(--term-amber)]"
          }`}
        >
          {">"} {message.text}
        </p>
      )}

      {challenge && round && (
        <div className="term-panel space-y-3" {...telemetry.guardProps}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="hud-recid">
              {challenge.purpose === "restore" ? "RESTORE" : verb} {"//"} {challenge.systemLabel} {"//"}{" "}
              {challenge.label}
              {challenge.attemptsLeft > 1 && <> — {challenge.attemptsLeft} ATTEMPTS</>}
            </p>
            <Countdown
              key={challenge.nonce}
              deadlineMs={challenge.deadlineAt}
              serverNowMs={round.serverNow}
              onExpire={() => setMessage({ text: "TIME EXPIRED — SUBMIT TO CLOSE IT OUT.", tone: "bad" })}
              label="SEC"
            />
          </div>
          <p className="text-xs text-[var(--term-fg-dim)] leading-snug">{challenge.brief}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="space-y-3"
          >
            <GameSurface
              game={challenge.game}
              payload={challenge.payload}
              value={answer}
              onChange={setAnswer}
              disabled={pending}
              signals={telemetry.signals}
            />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="term-button" disabled={pending || answer.trim() === ""}>
                {pending ? "TRANSMITTING..." : "[SUBMIT]"}
              </button>
              <button
                type="button"
                className="term-button term-button--sm term-button--ghost"
                onClick={walkAway}
                disabled={pending}
              >
                [ABANDON]
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
