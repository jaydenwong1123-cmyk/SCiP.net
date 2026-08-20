import type { HackGame } from "./types";

export type DaemonPayload = {
  matrix: string[][];
  target: string[];
  bufferSize: number;
};

type DaemonSolution = {
  matrix: string[][];
  target: string[];
};

// BREACH PROTOCOL.
//
// The hardest game in the registry. A hex matrix; picks alternate between
// "anywhere in the current row" and "anywhere in the current column", and the
// first pick must come from row 1. The player must produce a pick sequence
// whose values spell the target exactly.
//
// Answers are COORDINATES, not values, because the same byte appears many
// times in the matrix and only the path proves the traversal was actually
// solved. The grader re-walks the submitted path and checks both that every
// move was legal and that the values spell the target, so reading the target
// off the payload and typing it back gets nowhere.
//
// The solution therefore carries the board as well as the path: grading is a
// re-simulation, not a string compare, which also means any legal path to the
// target is accepted rather than only the one the generator happened to walk.
export const daemonGame: HackGame = {
  id: "daemon",
  label: "BREACH PROTOCOL",
  brief:
    "FIRST PICK FROM ROW 1. PICKS THEN ALTERNATE COLUMN / ROW. SPELL THE TARGET. SUBMIT COORDINATES, E.G. R1C2 R3C2 R3C5",
  minBand: 3,
  maxBand: 5,
  timeFactor: 1.4,
  // Find a path through the matrix, then click it out cell by cell.
  minHumanMs: 12000,

  generate(band, rng) {
    const size = band === 3 ? 5 : band === 4 ? 6 : 7;
    const targetLength = band === 3 ? 4 : band === 4 ? 5 : 6;

    // A deliberately small byte alphabet, so values repeat all over the board
    // and the coordinate path is genuinely the thing being tested.
    const alphabet = ["1C", "55", "7A", "BD", "E9", "FF"];
    const matrix: string[][] = Array.from({ length: size }, () =>
      Array.from({ length: size }, () => rng.pick(alphabet))
    );

    // Walk a legal path first, then read the target off it. Generating a
    // target independently would routinely produce an unsolvable board.
    const target: string[] = [];
    let row = 0;
    let col = rng.int(0, size - 1);
    let constrainRow = true;

    for (let step = 0; step < targetLength; step++) {
      if (constrainRow) col = rng.int(0, size - 1);
      else row = rng.int(0, size - 1);
      target.push(matrix[row][col]);
      constrainRow = !constrainRow;
    }

    return {
      payload: {
        matrix,
        target,
        bufferSize: targetLength,
      } satisfies DaemonPayload,
      solution: { matrix, target } satisfies DaemonSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { matrix, target } = solution as DaemonSolution;

    // Parsed locally rather than via normalizeList: a legal path may revisit a
    // cell, and that helper de-duplicates.
    const picks = answer
      .toUpperCase()
      .split(/[\s,>-]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => /^R(\d+)C(\d+)$/.exec(token));

    if (picks.some((m) => m === null) || picks.length !== target.length) {
      return {
        correct: false,
        feedback: `BUFFER REQUIRES EXACTLY ${target.length} PICKS AS RnCn`,
      };
    }

    let prevRow = -1;
    let prevCol = -1;
    for (let i = 0; i < picks.length; i++) {
      const match = picks[i] as RegExpExecArray;
      const row = Number(match[1]) - 1;
      const col = Number(match[2]) - 1;

      if (
        !Number.isInteger(row) ||
        !Number.isInteger(col) ||
        row < 0 ||
        col < 0 ||
        row >= matrix.length ||
        col >= matrix.length
      ) {
        return { correct: false, feedback: "PICK OUT OF BOUNDS" };
      }

      // Move legality. The first pick is locked to row 1; after that the
      // constraint alternates, inheriting from the previous pick.
      if (i === 0) {
        if (row !== 0) return { correct: false, feedback: "FIRST PICK MUST BE IN ROW 1" };
      } else if (i % 2 === 1) {
        if (col !== prevCol) return { correct: false, feedback: "ILLEGAL MOVE — COLUMN LOCKED" };
      } else {
        if (row !== prevRow) return { correct: false, feedback: "ILLEGAL MOVE — ROW LOCKED" };
      }

      if (matrix[row][col] !== target[i]) {
        return { correct: false, feedback: "SEQUENCE MISMATCH" };
      }

      prevRow = row;
      prevCol = col;
    }

    return { correct: true };
  },
};
