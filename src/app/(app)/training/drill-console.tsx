"use client";

import { useState, useTransition } from "react";
import { GameSurface, useRoundInput } from "../hack/games";
import { startDrillAction, submitDrillAction } from "./actions";
import {
  DRILL_BANDS,
  drillBandLabel,
  type DrillGameInfo,
  type PublicDrill,
  type DrillResult,
} from "@/lib/hack/drills";

// The training range console.
//
// Reuses GameSurface — the same renderers the intrusion and trace consoles
// mount — rather than reimplementing ten puzzles. They are purely
// presentational: each draws a payload and reports a string, decides nothing,
// and takes its conduct telemetry as an OPTIONAL prop. Omitting `signals` is
// therefore a supported mount, and it is the correct one here: practice is not
// evidence and must not be scored.

export function DrillConsole({ roster }: { roster: DrillGameInfo[] }) {
  const [band, setBand] = useState<number>(DRILL_BANDS[0]);
  const [game, setGame] = useState<string>("");
  const [drill, setDrill] = useState<PublicDrill | null>(null);
  const [result, setResult] = useState<DrillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cleared whenever a new puzzle arrives, so an answer never carries over.
  const [answer, setAnswer] = useRoundInput(drill?.nonce ?? "");

  const eligible = roster.filter(
    (g) => band >= g.minBand && band <= g.maxBand
  );
  const selected = eligible.find((g) => g.id === game) ?? null;
  const settled = result !== null && result.answerKey !== null;

  // Moving the difficulty can strand the current pick outside its own window.
  // Dropping it is the honest outcome — the server refuses that pair anyway,
  // so silently keeping it would only defer the same refusal to submit time.
  const pickBand = (next: number) => {
    setBand(next);
    const stillEligible = roster.some(
      (g) => g.id === game && next >= g.minBand && next <= g.maxBand
    );
    if (!stillEligible) setGame("");
  };

  const start = (gameId: string, atBand: number) => {
    startTransition(async () => {
      const state = await startDrillAction(gameId, atBand);
      if (!state.ok) {
        setError(state.error);
        return;
      }
      setError(null);
      setResult(null);
      setDrill(state.drill);
    });
  };

  const submit = () => {
    if (!drill || answer.trim() === "") return;
    startTransition(async () => {
      const state = await submitDrillAction(drill.nonce, answer);
      if (!state.ok) {
        setError(state.error);
        return;
      }
      setError(null);
      setResult(state.result);
    });
  };

  return (
    <div className="space-y-4">
      <fieldset className="space-y-1">
        <legend className="hud-readout__label mb-1">DIFFICULTY</legend>
        <div className="flex flex-wrap gap-2">
          {DRILL_BANDS.map((b) => (
            <label key={b} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="band"
                value={b}
                checked={band === b}
                onChange={() => pickBand(b)}
                disabled={pending}
              />
              <span
                className={
                  band === b
                    ? "text-[var(--term-fg-bright)]"
                    : "text-[var(--term-fg-dim)]"
                }
              >
                {drillBandLabel(b)}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug pt-1">
          BAND {band} — {eligible.length} DRILL
          {eligible.length === 1 ? "" : "S"} RUN AT THIS DIFFICULTY.
        </p>
      </fieldset>

      <label className="block text-sm">
        <span className="hud-readout__label block mb-1">DRILL</span>
        <select
          value={game}
          onChange={(e) => setGame(e.target.value)}
          disabled={pending}
          className="term-input w-full"
        >
          <option value="">— SELECT —</option>
          {eligible.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </label>

      {selected && (
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug">
          {selected.brief}
          <span className="block pt-1">
            RUNS AT {drillBandLabel(selected.minBand)}–
            {drillBandLabel(selected.maxBand)}.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => selected && start(selected.id, band)}
          disabled={pending || !selected}
          className="term-button"
        >
          {pending && !drill ? "GENERATING..." : "[START DRILL]"}
        </button>
        {drill && (
          <button
            type="button"
            onClick={() => start(drill.game, drill.band)}
            disabled={pending}
            className="term-button term-button--sm term-button--ghost"
          >
            [RE-ROLL]
          </button>
        )}
      </div>

      {error && <p className="text-sm text-[var(--term-red)]">{error}</p>}

      {drill && (
        <div className="space-y-3 pt-1">
          <p className="hud-recid">
            {drill.label} — {drill.bandLabel}
            {!settled && drill.attemptsLeft > 1 && (
              <> — {result?.attemptsLeft ?? drill.attemptsLeft} ATTEMPTS LEFT</>
            )}
          </p>
          <p className="text-xs text-[var(--term-fg-dim)] leading-snug">
            {drill.brief}
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-3"
          >
            <GameSurface
              game={drill.game}
              payload={drill.payload}
              value={answer}
              onChange={(v) => {
                setResult(null);
                setAnswer(v);
              }}
              disabled={pending || settled}
            />

            <button
              type="submit"
              disabled={pending || settled || answer.trim() === ""}
              className="term-button"
            >
              {pending ? "GRADING..." : "[SUBMIT ANSWER]"}
            </button>
          </form>

          {result && (
            <div className="space-y-2">
              <p
                className={`text-sm ${
                  result.correct
                    ? "text-[var(--term-fg-bright)]"
                    : "text-[var(--term-red)]"
                }`}
              >
                {result.correct ? "CORRECT." : "INCORRECT."}
              </p>
              {result.feedback && (
                <p className="text-sm text-[var(--term-amber)]">
                  <span className="text-[var(--term-fg-dim)]">{">"}</span>{" "}
                  {result.feedback}
                </p>
              )}
              {!settled && (
                <p className="text-xs text-[var(--term-fg-dim)]">
                  {result.attemptsLeft} ATTEMPT
                  {result.attemptsLeft === 1 ? "" : "S"} LEFT — KEEP GOING.
                </p>
              )}
              {result.answerKey && (
                <div className="space-y-1">
                  <p className="hud-readout__label">ANSWER KEY</p>
                  <pre className="hack-surface hack-mono text-xs overflow-x-auto">
                    {result.answerKey}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
