import type { HackGame } from "./types";
import { normalizeList, sameSet } from "./types";

export type MinesweeperPayload = {
  size: number;
  mineCount: number;
  // null = a mine. 0-8 = that safe cell's adjacent mine count. Every safe
  // cell is included — the client is the one that keeps them covered and
  // reveals them progressively as the player clicks, exactly like a real
  // board; the server has no notion of "revealed" at all.
  cells: (number | null)[][];
};

type MinesweeperSolution = { mines: string[] };

const MINE_DENSITY = 0.16;
const GEN_ATTEMPTS = 400;

function neighborsOf(r: number, c: number, size: number): [number, number][] {
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

function coord(size: number, key: number): string {
  return `R${Math.floor(key / size) + 1}C${(key % size) + 1}`;
}

// FIREWALL AUDIT's replacement. Board size scales with band: 4x4 at L2-L3,
// 6x6 at L4, 8x8 at L5, 10x10 at the deepest layer. Played like a real board
// client-side — click to uncover, flag the mines — but the answer that is
// actually graded is only ever the flag list.
//
// Generation still runs a single-point deduction solver (a cell whose
// covered neighbors exactly match its remaining count pins every one of them
// as a mine; a cell with nothing left pinned clears the rest as safe) purely
// to GUARANTEE every mine is locatable without a blind guess. Layouts the
// solver can't fully resolve are rejected and re-rolled — see the retry loop
// below.
export const minesweeperGame: HackGame = {
  id: "minesweeper",
  label: "MINE SURVEY",
  brief:
    "CLICK A COVERED CELL TO UNCOVER IT. FLAG EVERY CELL THAT MUST BE A MINE. CLEAR THE FIELD AND FLAG EVERY MINE, THEN TRANSMIT.",
  // Raised off band 1 so the deep stages skew toward it: a minefield lives in
  // the RENDER, not in any text on the page, and its state only exists after
  // clicks that no screenshot captures.
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.3,
  // The field must be cleared AND every mine flagged - dozens of clicks at minimum.
  minHumanMs: 20000,

  generate(band, rng) {
    const size = band <= 2 ? 4 : band === 3 ? 6 : band === 4 ? 8 : 10;
    const mineCount = Math.max(2, Math.round(size * size * MINE_DENSITY));
    const total = size * size;
    const allIdx = Array.from({ length: total }, (_, i) => i);

    for (let attempt = 0; attempt < GEN_ATTEMPTS; attempt++) {
      const mineIdx = new Set(rng.sample(allIdx, mineCount));
      const isMine = (r: number, c: number) => mineIdx.has(r * size + c);

      const numbers: number[][] = Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) =>
          isMine(r, c)
            ? -1
            : neighborsOf(r, c, size).filter(([nr, nc]) => isMine(nr, nc)).length
        )
      );

      const zeroCells: [number, number][] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (numbers[r][c] === 0) zeroCells.push([r, c]);
        }
      }
      if (zeroCells.length === 0) continue;

      // Flood-fill from a random opening, exactly like a real first click:
      // a zero cell reveals itself and cascades into every neighbor, which in
      // turn cascades further only if it is also a zero.
      const [sr, sc] = rng.pick(zeroCells);
      const revealed = new Set<number>([sr * size + sc]);
      const queue: [number, number][] = [[sr, sc]];
      while (queue.length > 0) {
        const [r, c] = queue.pop() as [number, number];
        if (numbers[r][c] !== 0) continue;
        for (const [nr, nc] of neighborsOf(r, c, size)) {
          const key = nr * size + nc;
          if (!revealed.has(key) && !isMine(nr, nc)) {
            revealed.add(key);
            queue.push([nr, nc]);
          }
        }
      }

      // Single-point constraint propagation to a fixpoint.
      const deducedMines = new Set<number>();
      let changed = true;
      while (changed) {
        changed = false;
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            const key = r * size + c;
            if (!revealed.has(key) || numbers[r][c] <= 0) continue;
            const nbrs = neighborsOf(r, c, size);
            const covered = nbrs.filter(
              ([nr, nc]) =>
                !revealed.has(nr * size + nc) && !deducedMines.has(nr * size + nc)
            );
            if (covered.length === 0) continue;
            const alreadyMined = nbrs.filter(([nr, nc]) =>
              deducedMines.has(nr * size + nc)
            ).length;
            const remaining = numbers[r][c] - alreadyMined;
            if (remaining === covered.length) {
              for (const [nr, nc] of covered) deducedMines.add(nr * size + nc);
              changed = true;
            } else if (remaining === 0) {
              for (const [nr, nc] of covered) {
                const k = nr * size + nc;
                if (!revealed.has(k)) {
                  revealed.add(k);
                  changed = true;
                }
              }
            }
          }
        }
      }

      const solvedFully =
        deducedMines.size === mineCount &&
        [...deducedMines].every((k) => mineIdx.has(k)) &&
        revealed.size + deducedMines.size === total;
      if (!solvedFully) continue;

      const cells: (number | null)[][] = Array.from({ length: size }, (_, r) =>
        Array.from({ length: size }, (_, c) =>
          revealed.has(r * size + c) ? numbers[r][c] : null
        )
      );

      return {
        payload: { size, mineCount, cells } satisfies MinesweeperPayload,
        solution: {
          mines: [...mineIdx].map((k) => coord(size, k)).sort(),
        } satisfies MinesweeperSolution,
        attempts: 1,
      };
    }

    // Every retry produced a layout the propagation solver couldn't fully
    // crack. Fall back to revealing the entire safe field — the covered cells
    // are then trivially exactly the mines, so the puzzle stays well-posed
    // even on the rare seed that beats the solver.
    const mineIdx = new Set(rng.sample(allIdx, mineCount));
    const isMine = (r: number, c: number) => mineIdx.has(r * size + c);
    const cells: (number | null)[][] = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) =>
        isMine(r, c)
          ? null
          : neighborsOf(r, c, size).filter(([nr, nc]) => isMine(nr, nc)).length
      )
    );

    return {
      payload: { size, mineCount, cells } satisfies MinesweeperPayload,
      solution: {
        mines: [...mineIdx].map((k) => coord(size, k)).sort(),
      } satisfies MinesweeperSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { mines } = solution as MinesweeperSolution;
    return { correct: sameSet(normalizeList(answer), mines) };
  },
};
