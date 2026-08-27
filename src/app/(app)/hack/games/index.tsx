"use client";

import { useEffect, useRef, useState } from "react";
import type {
  CipherPayload,
} from "@/lib/hack/games/cipher";
import type { IcebreakerPayload } from "@/lib/hack/games/icebreaker";
import type { WaveformPayload } from "@/lib/hack/games/waveform";
import type { BytepairPayload } from "@/lib/hack/games/bytepair";
import type { NodetracePayload } from "@/lib/hack/games/nodetrace";
import type { KeypadPayload } from "@/lib/hack/games/keypad";
import type { AnomalyPayload } from "@/lib/hack/games/anomaly";
import type { SignaturePayload } from "@/lib/hack/games/signature";
import type { DaemonPayload } from "@/lib/hack/games/daemon";
import type { MinesweeperPayload } from "@/lib/hack/games/minesweeper";
import type { StopwatchPayload } from "@/lib/hack/games/stopwatch";
import { Glyphs } from "./obfuscate";
import type { RoundSignals } from "@/lib/hack/telemetry";

// The puzzle renderers, one per game in lib/hack/games.
//
// Every one of them is presentational: it draws the payload and reports a
// string. None decides whether the answer is right, none knows the deadline,
// and none holds state beyond the input being composed. That is what lets the
// intrusion console and RAISA's trace console share them without either
// knowing which game is on screen.
//
// They are collected in one module rather than one file each because they are
// each 20-40 lines of markup with no logic worth isolating, and a single
// dispatch table is easier to keep in step with the server registry.

export type GameProps = {
  payload: unknown;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  // Conduct telemetry, threaded down from whichever console is hosting the
  // puzzle. Optional so a renderer can be mounted without one — the surfaces
  // that grade for real all pass it.
  signals?: RoundSignals;
};

const PANEL = "hack-surface";

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-[var(--term-fg-dim)] leading-snug">{children}</p>
  );
}

// A plain answer box, used by every game whose answer is typed rather than
// assembled by clicking.
//
// Paste is refused. A human composing an answer types it or clicks it out; the
// only thing a paste buys is delivering a long machine-produced answer — a
// full anomaly ID list, a daemon coordinate chain — in one motion. Refusing it
// costs a legitimate player nothing and makes the transcription step of an
// AI-assisted solve as slow as doing it by hand.
function AnswerLine({
  value,
  onChange,
  disabled,
  placeholder,
  signals,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  placeholder: string;
  signals?: RoundSignals;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Focus on mount and whenever a new round swaps the component in, so a run
  // can be played entirely from the keyboard.
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <input
      ref={ref}
      name="answer"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={() => signals?.key()}
      onPaste={(e) => {
        e.preventDefault();
        signals?.blockedPaste();
      }}
      disabled={disabled}
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      placeholder={placeholder}
      className="term-input w-full uppercase"
      aria-label="Answer"
    />
  );
}

function CipherGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as CipherPayload;
  return (
    <div className="space-y-3">
      <div className={`${PANEL} hack-mono`}>
        <Glyphs text={p.ciphertext} />
      </div>
      {p.shift !== null && <Hint>CAESAR SHIFT: +{p.shift}</Hint>}
      {p.table && (
        <div className="hack-table-scroll">
          <table className="hack-mono text-xs">
            <tbody>
              <tr>
                <th className="pr-2 text-left text-[var(--term-fg-dim)]">CIPHER</th>
                {p.table.map(([c], i) => (
                  <td key={i} className="px-1"><Glyphs text={c} /></td>
                ))}
              </tr>
              <tr>
                <th className="pr-2 text-left text-[var(--term-fg-dim)]">PLAIN</th>
                {p.table.map(([, plain], i) => (
                  <td key={i} className="px-1 text-[var(--term-fg-bright)]">
                    <Glyphs text={plain} />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="PLAINTEXT" />
    </div>
  );
}

function IcebreakerGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as IcebreakerPayload;
  return (
    <div className="space-y-3">
      <div className={`${PANEL} hack-mono hack-scroll`}>
        {p.lines.map((line) => (
          <div key={line.address} className="whitespace-pre">
            <span className="text-[var(--term-fg-dim)]">{line.address}  </span>
            <span className="text-[var(--term-fg-dim)]">
              <Glyphs text={line.junk} />
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                signals?.pointer();
                onChange(line.word);
              }}
              className="hack-pick"
            >
              <Glyphs text={line.word} />
            </button>
            <span className="text-[var(--term-fg-dim)]">
              <Glyphs text={line.tail} />
            </span>
          </div>
        ))}
      </div>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder={`${p.wordLength}-CHARACTER KEY`} />
    </div>
  );
}

function WaveformGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as WaveformPayload;
  return (
    <div className="space-y-3">
      <div className={`${PANEL} hack-mono hack-scroll`}>
        <div className="whitespace-pre">
          <span className="text-[var(--term-fg-dim)]">REF   </span>
          <span className="text-[var(--term-fg-bright)]">{p.reference}</span>
        </div>
        <div className="my-1 border-t border-[var(--term-border)]/30" />
        {p.candidates.map((c) => (
          <div key={c.id} className="whitespace-pre">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                signals?.pointer();
                onChange(c.id);
              }}
              className="hack-pick"
            >
              {c.id}
            </button>
            <span className="text-[var(--term-fg-dim)]">   {c.trace}</span>
          </div>
        ))}
      </div>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="TRACE ID" />
    </div>
  );
}

function BytepairGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as BytepairPayload;
  const picked = value.split(/[\s,]+/).filter(Boolean);

  const toggle = (byte: string) => {
    signals?.pointer();
    const next = picked.includes(byte)
      ? picked.filter((b) => b !== byte)
      : [...picked, byte];
    onChange(next.join(" "));
  };

  return (
    <div className="space-y-3">
      <Hint>
        {p.orphanCount} BYTES ARE UNPAIRED.
        {p.ordered ? " SUBMIT THEM IN ASCENDING ORDER." : " ORDER DOES NOT MATTER."}
      </Hint>
      <div className={`${PANEL} hack-scroll`}>
        <div className="hack-grid" style={{ ["--hack-cols" as string]: String(p.grid.length) }}>
          {p.grid.map((row, r) =>
            row.map((byte, c) => (
              <button
                key={`${r}-${c}`}
                type="button"
                disabled={disabled}
                onClick={() => toggle(byte)}
                aria-pressed={picked.includes(byte)}
                className={`hack-cell${picked.includes(byte) ? " hack-cell--picked" : ""}`}
              >
                {byte}
              </button>
            ))
          )}
        </div>
      </div>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="UNPAIRED BYTES" />
    </div>
  );
}

function NodetraceGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as NodetracePayload;
  const chain = value.split(/[\s,>-]+/).filter(Boolean);
  return (
    <div className="space-y-3">
      <Hint>
        {p.entry} {"->"} {p.core} · {p.rule}
      </Hint>
      <div className={`${PANEL} hack-mono hack-scroll`}>
        {p.edges.map((e, i) => (
          <div key={i} className="whitespace-pre text-xs">
            <span className={e.from === p.banned || e.to === p.banned ? "hack-banned" : ""}>
              {e.from} {"->"} {e.to}
            </span>
            <span className="text-[var(--term-fg-dim)]">  {e.cost}ms</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {p.nodes.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => {
              signals?.pointer();
              onChange([...chain, n].join(" "));
            }}
            className="hack-chip"
          >
            {n}
          </button>
        ))}
      </div>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="HOP SEQUENCE" />
    </div>
  );
}

function KeypadGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as KeypadPayload;
  return (
    <div className="space-y-3">
      {/* Here the clues ARE the puzzle — the whole game is the constraint set —
          so unlike ANOMALY's rules these do get obfuscated. */}
      <ul className={`${PANEL} text-xs space-y-1`}>
        {p.clues.map((clue, i) => (
          <li key={i}>
            <span className="text-[var(--term-fg-dim)]">{">"}</span>{" "}
            <Glyphs text={clue} />
          </li>
        ))}
      </ul>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder={`${p.length}-DIGIT CODE`} />
    </div>
  );
}

// Detonating a real cell forces an answer no flag list can ever match —
// the round then fails the normal wrong-answer path on TRANSMIT, so the
// server stays the sole authority on the outcome even though the "boom" is
// entirely a client-side reaction.
const DETONATED_ANSWER = "DETONATED";

function mineNeighbors(r: number, c: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) out.push([nr, nc]);
    }
  }
  return out;
}

function MinesweeperGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as MinesweeperPayload;
  const flagged = value.split(/[\s,]+/).filter(Boolean);

  // Reveal state lives here rather than in `value` — only the flag list is
  // ever graded, so what has been clicked open is pure client presentation.
  // Reset whenever a new round hands this component a fresh payload object,
  // mirroring the adjust-during-render pattern useRoundInput uses for nonce.
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [detonatedAt, setDetonatedAt] = useState<string | null>(null);
  const [flagMode, setFlagMode] = useState(false);
  const [seenPayload, setSeenPayload] = useState(payload);
  if (payload !== seenPayload) {
    setSeenPayload(payload);
    setRevealed(new Set());
    setDetonatedAt(null);
    setFlagMode(false);
  }

  const locked = disabled || detonatedAt !== null;
  const totalSafe = p.size * p.size - p.mineCount;
  const cleared = revealed.size >= totalSafe && flagged.length === p.mineCount;

  const toggleFlag = (r: number, c: number) => {
    signals?.pointer();
    const key = `${r}-${c}`;
    if (revealed.has(key)) return;
    const coord = `R${r + 1}C${c + 1}`;
    const next = flagged.includes(coord)
      ? flagged.filter((f) => f !== coord)
      : [...flagged, coord];
    onChange(next.join(" "));
  };

  const reveal = (r: number, c: number) => {
    signals?.pointer();
    const key = `${r}-${c}`;
    if (revealed.has(key) || flagged.includes(`R${r + 1}C${c + 1}`)) return;

    if (p.cells[r][c] === null) {
      setDetonatedAt(key);
      onChange(DETONATED_ANSWER);
      return;
    }

    // Flood-reveal from here, exactly like a real click: a 0 cascades into
    // its neighbors, a nonzero number stops the spread at itself.
    const next = new Set(revealed);
    const stack: [number, number][] = [[r, c]];
    while (stack.length > 0) {
      const [rr, cc] = stack.pop() as [number, number];
      const k = `${rr}-${cc}`;
      if (next.has(k)) continue;
      const v = p.cells[rr][cc];
      if (v === null) continue;
      next.add(k);
      if (v === 0) {
        for (const [nr, nc] of mineNeighbors(rr, cc, p.size)) {
          if (!next.has(`${nr}-${nc}`)) stack.push([nr, nc]);
        }
      }
    }
    setRevealed(next);
  };

  return (
    <div className="space-y-3">
      <Hint>
        {p.mineCount} MINES ON THE FIELD. CLICK A COVERED CELL TO UNCOVER IT.
        {" "}FLAG EVERY MINE — RIGHT-CLICK, OR TOGGLE FLAG MODE BELOW. TRANSMIT
        ONCE THE FIELD IS FULLY CLEARED AND EVERY MINE IS FLAGGED.
      </Hint>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={locked}
          onClick={() => setFlagMode((m) => !m)}
          aria-pressed={flagMode}
          className={`term-button text-xs${flagMode ? " hack-button--risk" : ""}`}
        >
          {flagMode ? "[ FLAG MODE: ON ]" : "[ FLAG MODE: OFF ]"}
        </button>
        <span className="text-xs text-[var(--term-fg-dim)]">
          {flagged.length}/{p.mineCount} FLAGGED
        </span>
      </div>
      <div className={`${PANEL} hack-scroll`}>
        <div className="hack-mine-grid" style={{ ["--hack-cols" as string]: String(p.size) }}>
          {p.cells.map((row, r) =>
            row.map((n, c) => {
              const key = `${r}-${c}`;
              const coord = `R${r + 1}C${c + 1}`;
              const isRevealed = revealed.has(key);
              const isFlagged = flagged.includes(coord);
              const isMine = n === null;
              const showAsMine = detonatedAt !== null && isMine;

              if (isRevealed) {
                return (
                  <span
                    key={coord}
                    className="hack-mine-cell hack-mine-cell--revealed"
                    aria-label={`${coord} adjacent mines ${n}`}
                  >
                    {n === 0 ? "" : n}
                  </span>
                );
              }

              return (
                <button
                  key={coord}
                  type="button"
                  disabled={locked}
                  onClick={() => (flagMode ? toggleFlag(r, c) : reveal(r, c))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (!locked) toggleFlag(r, c);
                  }}
                  aria-pressed={isFlagged}
                  aria-label={`${coord}${isFlagged ? " flagged" : " covered"}`}
                  className={`hack-mine-cell${
                    key === detonatedAt
                      ? " hack-mine-cell--mine"
                      : showAsMine
                        ? " hack-mine-cell--mine"
                        : isFlagged
                          ? " hack-mine-cell--flagged"
                          : ""
                  }`}
                >
                  {key === detonatedAt ? "*" : showAsMine ? "•" : isFlagged ? "F" : "?"}
                </button>
              );
            })
          )}
        </div>
      </div>
      {detonatedAt && (
        <p className="text-sm text-[var(--term-red)]">
          DETONATED — TRANSMIT TO CONFIRM THE FAILURE.
        </p>
      )}
      {!detonatedAt && cleared && (
        <p className="text-sm text-[var(--term-fg-bright)]">
          FIELD CLEARED — TRANSMIT TO CONFIRM.
        </p>
      )}
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="MINE COORDINATES" />
    </div>
  );
}

function AnomalyGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as AnomalyPayload;
  return (
    <div className="space-y-3">
      {/* The rules stay plain text on purpose: they are the same handful of
          templates every round, so obfuscating them protects nothing, and a
          player rereading a rule mid-round should be able to select it. The
          RECORDS are the puzzle, and those are obfuscated. */}
      <ul className="text-xs space-y-1">
        {p.rules.map((rule, i) => (
          <li key={i}>
            <span className="text-[var(--term-fg-dim)]">RULE {i + 1}:</span> {rule}
          </li>
        ))}
      </ul>
      <div className={`${PANEL} hack-mono hack-scroll text-xs`}>
        <div className="whitespace-pre text-[var(--term-fg-dim)]">
          ID        CLASS   STATE      MASS  TEMP
        </div>
        {p.records.map((r) => (
          <div key={r.id} className="whitespace-pre">
            <Glyphs
              text={
                `${r.id.padEnd(10, " ")}${r.class.padEnd(8, " ")}` +
                `${r.state.padEnd(11, " ")}${String(r.mass).padStart(4, " ")}  ` +
                `${String(r.temp).padStart(4, " ")}`
              }
            />
          </div>
        ))}
      </div>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="VIOLATING IDS, OR NONE" />
    </div>
  );
}

function SignatureGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as SignaturePayload;
  return (
    <div className="space-y-3">
      <ul className="text-xs space-y-1">
        {p.rules.map((rule, i) => (
          <li key={i}>
            <span className="text-[var(--term-fg-dim)]">{">"}</span> {rule}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1">
        {p.fragments.map((f, i) => (
          <button
            key={`${f}-${i}`}
            type="button"
            disabled={disabled}
            onClick={() => {
              signals?.pointer();
              onChange(value + f);
            }}
            className="hack-chip"
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange("")}
          className="term-button text-xs"
        >
          [CLEAR]
        </button>
        <span className="text-xs text-[var(--term-fg-dim)] self-center">
          {value.replace(/[^A-Z0-9]/gi, "").length} / {p.tokenLength}
        </span>
      </div>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="ASSEMBLED TOKEN" />
    </div>
  );
}

function DaemonGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as DaemonPayload;
  const picks = value.split(/[\s,]+/).filter(Boolean);
  return (
    <div className="space-y-3">
      <Hint>
        TARGET: <span className="text-[var(--term-fg-bright)]">{p.target.join(" ")}</span> · BUFFER {p.bufferSize}
      </Hint>
      <div className={`${PANEL} hack-scroll`}>
        <div className="hack-grid" style={{ ["--hack-cols" as string]: String(p.matrix.length) }}>
          {p.matrix.map((row, r) =>
            row.map((byte, c) => {
              const coord = `R${r + 1}C${c + 1}`;
              return (
                <button
                  key={coord}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    signals?.pointer();
                    onChange([...picks, coord].join(" "));
                  }}
                  className={`hack-cell${picks.includes(coord) ? " hack-cell--picked" : ""}`}
                  aria-label={`${coord} value ${byte}`}
                >
                  {byte}
                </button>
              );
            })
          )}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(picks.slice(0, -1).join(" "))}
          className="term-button text-xs"
        >
          [UNDO]
        </button>
        <span className="text-xs text-[var(--term-fg-dim)] self-center">
          {picks.length} / {p.bufferSize} PICKS
        </span>
      </div>
      <AnswerLine value={value} onChange={onChange} disabled={disabled} signals={signals} placeholder="R1C2 R3C2 ..." />
    </div>
  );
}

// Shared by both TIMING GATE ids — the L-1 and O5 cuts differ only in the
// window their payload carries, never in how the clock is drawn or driven.
function fmtClock(ms: number): string {
  return (ms / 1000).toFixed(2) + "s";
}

function StopwatchGame({ payload, value, onChange, disabled, signals }: GameProps) {
  const p = payload as StopwatchPayload;

  const [seenPayload, setSeenPayload] = useState(payload);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [displayMs, setDisplayMs] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // A fresh round — new payload object — resets the clock even if the last
  // one was left running, mirroring the reveal-state reset MINESWEEPER does
  // for the same reason: the component is reused across rounds, its local
  // state is not.
  if (payload !== seenPayload) {
    setSeenPayload(payload);
    setRunning(false);
    setStopped(false);
    setDisplayMs(0);
    startRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (startRef.current !== null) {
        setDisplayMs(performance.now() - startRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [running]);

  // One stop per round: once the clock has been stopped the reading stands and
  // the only move left is to transmit it. Restarting would make the tolerance
  // meaningless, since a player could simply keep re-running until they landed
  // inside the window.
  const start = () => {
    if (disabled || running || stopped) return;
    signals?.pointer();
    startRef.current = performance.now();
    setDisplayMs(0);
    setRunning(true);
    onChange("");
  };

  // The only thing that ever leaves this component: the raw elapsed
  // milliseconds between this click and START, measured entirely in the
  // browser. grade() compares it to the hidden target server-side — same
  // trust boundary as every other game's typed answer, just measured in
  // time instead of characters.
  const stop = () => {
    if (!running || startRef.current === null) return;
    signals?.pointer();
    const elapsed = performance.now() - startRef.current;
    setRunning(false);
    setStopped(true);
    setDisplayMs(elapsed);
    onChange(String(Math.round(elapsed)));
  };

  return (
    <div className="space-y-3">
      <Hint>
        STOP THE CLOCK INSIDE THE WINDOW: {fmtClock(p.windowStartMs)} –{" "}
        {fmtClock(p.windowEndMs)}.
      </Hint>
      <div className={`${PANEL} hack-mono text-center text-2xl py-4`}>
        {fmtClock(displayMs)}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled || running || stopped}
          onClick={start}
          className="term-button"
        >
          [START]
        </button>
        <button
          type="button"
          disabled={disabled || !running}
          onClick={stop}
          className="term-button hack-button--risk"
        >
          [STOP]
        </button>
      </div>
      {stopped && value !== "" && (
        <p className="text-xs text-[var(--term-fg-dim)]">
          STOPPED AT {fmtClock(Number(value))}. CLOCK IS LOCKED — TRANSMIT TO
          GRADE.
        </p>
      )}
    </div>
  );
}

const RENDERERS: Record<string, (props: GameProps) => React.ReactElement> = {
  cipher: CipherGame,
  icebreaker: IcebreakerGame,
  waveform: WaveformGame,
  bytepair: BytepairGame,
  nodetrace: NodetraceGame,
  keypad: KeypadGame,
  anomaly: AnomalyGame,
  signature: SignatureGame,
  daemon: DaemonGame,
  minesweeper: MinesweeperGame,
  "stopwatch-l1": StopwatchGame,
  "stopwatch-o5": StopwatchGame,
};

// Dispatch by the id the server drew. An unknown id can only mean the server
// registry gained a game this table has not caught up with — degrade to a bare
// answer box rather than blanking the console mid-run.
export function GameSurface({ game, ...props }: GameProps & { game: string }) {
  const Renderer = RENDERERS[game];
  if (!Renderer) {
    return (
      <div className="space-y-3">
        <Hint>RENDERER UNAVAILABLE FOR {game.toUpperCase()} — RAW INPUT ONLY.</Hint>
        <AnswerLine
          value={props.value}
          onChange={props.onChange}
          disabled={props.disabled}
          signals={props.signals}
          placeholder="ANSWER"
        />
      </div>
    );
  }
  return <Renderer {...props} />;
}

// Per-round input, cleared whenever a new challenge arrives.
//
// Uses React's adjust-state-during-render pattern rather than an effect: the
// reset has to happen before the new round paints, or the previous round's
// answer flashes in the box. An effect would also re-render twice for every
// round and trip react-hooks/set-state-in-effect.
export function useRoundInput(nonce: string) {
  const [value, setValue] = useState("");
  const [seenNonce, setSeenNonce] = useState(nonce);
  if (nonce !== seenNonce) {
    setSeenNonce(nonce);
    setValue("");
  }
  return [value, setValue] as const;
}
