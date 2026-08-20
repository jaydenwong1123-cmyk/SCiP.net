import type { HackGame } from "./types";
import { normalizeList, sameSet } from "./types";
import { SPECIMEN_PREFIXES } from "@/lib/hack/wordlist";

const CLASSES = ["SAFE", "EUCLID", "KETER"] as const;
const STATES = ["STABLE", "DRIFTING", "CRITICAL"] as const;

export type AnomalyPayload = {
  records: {
    id: string;
    class: string;
    state: string;
    mass: number;
    temp: number;
  }[];
  rules: string[];
};

type AnomalySolution = { violators: string[] };

type Rule = {
  text: string;
  // True when the record BREAKS this rule.
  violates: (r: AnomalyPayload["records"][number]) => boolean;
};

// CONTAINMENT TRIAGE.
//
// A specimen manifest plus a handful of containment rules; the player reports
// every record in breach. Reads as documentation review rather than as a
// puzzle, which makes it a pleasant change of pace in the middle bands — and
// like every computation game here, its real defence is the clock.
export const anomalyGame: HackGame = {
  id: "anomaly",
  label: "CONTAINMENT TRIAGE",
  brief: "REPORT THE ID OF EVERY RECORD IN BREACH OF THE STANDING RULES.",
  minBand: 2,
  maxBand: 4,
  timeFactor: 1.2,
  // Ten records against three rules: reading the table alone is most of this.
  minHumanMs: 18000,

  generate(band, rng) {
    const recordCount = band === 2 ? 6 : band === 3 ? 9 : 12;
    const ruleCount = band === 2 ? 2 : band === 3 ? 3 : 4;

    const prefix = rng.pick(SPECIMEN_PREFIXES);
    const records = Array.from({ length: recordCount }, (_, i) => ({
      id: `${prefix}-${(i + 1) * 3 + rng.int(0, 2)}`,
      class: rng.pick(CLASSES),
      state: rng.pick(STATES),
      mass: rng.int(1, 400),
      temp: rng.int(-60, 120),
    }));

    const massLimit = rng.int(150, 300);
    const tempLimit = rng.int(40, 90);
    const coldLimit = rng.int(-40, -5);

    const pool: Rule[] = [
      {
        text: `KETER-CLASS SPECIMENS MUST NOT BE ${STATES[1]} OR ${STATES[2]}`,
        violates: (r) => r.class === "KETER" && r.state !== "STABLE",
      },
      {
        text: `NO SPECIMEN MAY EXCEED ${massLimit} KG`,
        violates: (r) => r.mass > massLimit,
      },
      {
        text: `NO SPECIMEN MAY EXCEED ${tempLimit} C`,
        violates: (r) => r.temp > tempLimit,
      },
      {
        text: `NO SPECIMEN MAY FALL BELOW ${coldLimit} C`,
        violates: (r) => r.temp < coldLimit,
      },
      {
        text: "CRITICAL-STATE SPECIMENS MUST BE UNDER 100 KG",
        violates: (r) => r.state === "CRITICAL" && r.mass >= 100,
      },
      {
        text: "SAFE-CLASS SPECIMENS MUST NOT BE CRITICAL",
        violates: (r) => r.class === "SAFE" && r.state === "CRITICAL",
      },
    ];

    const rules = rng.sample(pool, ruleCount);
    const violators = records
      .filter((r) => rules.some((rule) => rule.violates(r)))
      .map((r) => r.id);

    return {
      payload: {
        records,
        rules: rules.map((r) => r.text),
      } satisfies AnomalyPayload,
      solution: { violators } satisfies AnomalySolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { violators } = solution as AnomalySolution;
    // Record ids carry a dash, which normalizeList strips — compare on the
    // same normalized footing rather than trying to preserve punctuation.
    const expected = violators.map((v) => v.replace(/[^A-Z0-9]/g, ""));
    const given = normalizeList(answer);
    if (expected.length === 0) {
      return { correct: given.length === 0 || sameSet(given, ["NONE"]) };
    }
    return { correct: sameSet(given, expected) };
  },
};
