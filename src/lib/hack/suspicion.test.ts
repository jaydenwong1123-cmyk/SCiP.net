import { describe, it, expect } from "vitest";
import { scoreSubmission, parseSignals } from "./suspicion";
import { SUSPICION_FLAG_SCORE } from "./config";
import { HACK_GAMES, GAME_IDS } from "./games";

// The conduct scorer.
//
// The load-bearing claim in this module's header — and in the copy shown to
// admins on /admin/conduct — is that NO COMBINATION of browser-reported signals
// can reach the review threshold on its own, because a script can forge all of
// them. Until now that was a comment. It is the first test below.

const GAME = GAME_IDS[0]!;
const FLOOR = HACK_GAMES[GAME]!.minHumanMs;

/** Every reported-tier signal turned up to its worst plausible value. */
const WORST_REPORTED = JSON.stringify({
  k: 0,
  p: 0,
  paste: 9,
  copy: 9,
  blurs: 20,
  blurMs: 600_000,
  t0: 599_000,
  ms: 600_000,
});

describe("the reported tier cannot flag on its own", () => {
  it("stays under the threshold with every forgeable signal maxed", () => {
    const { score, reasons } = scoreSubmission({
      game: GAME,
      // Comfortably ABOVE the human floor, so the unforgeable tier contributes
      // nothing and what remains is purely the browser's own account of itself.
      elapsedMs: FLOOR * 10,
      answer: "LONGANSWER",
      correct: true,
      rawSignals: WORST_REPORTED,
    });

    expect(reasons.length).toBeGreaterThan(0);
    expect(
      score,
      `reported-tier signals alone reached ${score}, at or past the ${SUSPICION_FLAG_SCORE} threshold — a scripted client could now forge a flag against an innocent member`
    ).toBeLessThan(SUSPICION_FLAG_SCORE);
  });

  it("holds for every game in the registry", () => {
    for (const id of GAME_IDS) {
      const { score } = scoreSubmission({
        game: id,
        elapsedMs: HACK_GAMES[id]!.minHumanMs * 10,
        answer: "LONGANSWER",
        correct: true,
        rawSignals: WORST_REPORTED,
      });
      expect(score, `${id} exceeded the threshold on reported signals`).toBeLessThan(
        SUSPICION_FLAG_SCORE
      );
    }
  });
});

describe("the unforgeable tier can flag on its own", () => {
  it("reaches the threshold well under half the human floor", () => {
    const { score, reasons } = scoreSubmission({
      game: GAME,
      elapsedMs: Math.floor(FLOOR / 4),
      answer: "ANSWER",
      correct: true,
      rawSignals: "",
    });
    expect(score).toBeGreaterThanOrEqual(SUSPICION_FLAG_SCORE);
    expect(reasons.join(" ")).toContain("HALF");
  });

  it("scores lower for merely-under-the-floor than for half of it", () => {
    const nearly = scoreSubmission({
      game: GAME,
      elapsedMs: Math.floor(FLOOR * 0.75),
      answer: "ANSWER",
      correct: true,
      rawSignals: "{}",
    });
    const far = scoreSubmission({
      game: GAME,
      elapsedMs: Math.floor(FLOOR * 0.25),
      answer: "ANSWER",
      correct: true,
      rawSignals: "{}",
    });
    expect(far.score).toBeGreaterThan(nearly.score);
  });

  it("scores nothing for a solve above the floor", () => {
    const { score } = scoreSubmission({
      game: GAME,
      elapsedMs: FLOOR * 3,
      answer: "ANSWER",
      correct: true,
      // A well-behaved console: typed, focused, no paste.
      rawSignals: JSON.stringify({ k: 12, p: 2, paste: 0, copy: 0, blurMs: 0, t0: 400, ms: FLOOR * 3 }),
    });
    expect(score).toBe(0);
  });
});

describe("scoring boundaries", () => {
  it("never scores a wrong answer", () => {
    // Guessing fast is what the guess-carrying games are FOR. Scoring a wrong
    // answer would punish exactly the intended play.
    const { score, reasons } = scoreSubmission({
      game: GAME,
      elapsedMs: 1,
      answer: "X",
      correct: false,
      rawSignals: WORST_REPORTED,
    });
    expect(score).toBe(0);
    expect(reasons).toEqual([]);
  });

  it("notes absent telemetry without flagging on it", () => {
    const { score, reasons } = scoreSubmission({
      game: GAME,
      elapsedMs: FLOOR * 5,
      answer: "ANSWER",
      correct: true,
      rawSignals: "",
    });
    expect(score).toBeLessThan(SUSPICION_FLAG_SCORE);
    expect(reasons.join(" ")).toContain("NO TELEMETRY");
  });

  it("does not penalise a short answer for having no keystrokes", () => {
    // The no-keystrokes signal is gated on an answer with real length behind
    // it; a one-character pick has nothing to explain.
    const { reasons } = scoreSubmission({
      game: GAME,
      elapsedMs: FLOOR * 5,
      answer: "A",
      correct: true,
      rawSignals: JSON.stringify({ k: 0, p: 0 }),
    });
    expect(reasons.join(" ")).not.toContain("NO KEYSTROKES");
  });

  it("treats an unknown game as having no floor rather than throwing", () => {
    expect(() =>
      scoreSubmission({
        game: "no-such-game",
        elapsedMs: 1,
        answer: "A",
        correct: true,
        rawSignals: "{}",
      })
    ).not.toThrow();
  });
});

describe("parseSignals", () => {
  it("returns null for empty or unparseable input", () => {
    for (const bad of ["", "not json", "[1,2,3]", "null", '"a string"', "42"]) {
      expect(parseSignals(bad)).toBeNull();
    }
  });

  it("drops non-numeric and non-finite fields", () => {
    const parsed = parseSignals(
      JSON.stringify({ k: "12", p: null, paste: NaN, copy: 3, blurs: Infinity })
    );
    expect(parsed).not.toBeNull();
    expect(parsed!.k).toBeUndefined();
    expect(parsed!.p).toBeUndefined();
    // NaN and Infinity do not survive JSON.stringify — they become null — and
    // must be dropped either way.
    expect(parsed!.paste).toBeUndefined();
    expect(parsed!.blurs).toBeUndefined();
    expect(parsed!.copy).toBe(3);
  });

  it("ignores unrecognised keys", () => {
    const parsed = parseSignals(JSON.stringify({ k: 1, evil: "payload" }));
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!)).not.toContain("evil");
  });

  it("does not throw on hostile input", () => {
    // This blob is written by the person it describes. It is the most literally
    // attacker-controlled input in the application.
    for (const hostile of [
      '{"k":{"toString":1}}',
      '{"__proto__":{"polluted":true}}',
      `{"k":${"9".repeat(400)}}`,
      "{".repeat(200),
    ]) {
      expect(() => parseSignals(hostile)).not.toThrow();
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
