import type { HackGame } from "./types";
import { normalizeList } from "./types";
import { NODE_LABELS } from "@/lib/hack/wordlist";

export type NodetracePayload = {
  nodes: string[];
  edges: { from: string; to: string; cost: number }[];
  entry: string;
  core: string;
  rule: string;
  banned: string | null;
};

type NodetraceSolution = { path: string[] };

// ROUTE RECONSTRUCTION.
//
// A layered DAG from ENTRY to CORE. The player reads the routing table and
// submits the hop sequence with the lowest total latency, sometimes with one
// node interdicted.
//
// Built in layers rather than as a general graph so a path always exists and
// every edge points forward — no cycles to reason about, which keeps the
// puzzle about reading carefully rather than about graph theory.
export const nodetraceGame: HackGame = {
  id: "nodetrace",
  label: "ROUTE RECONSTRUCTION",
  brief: "SUBMIT THE HOP SEQUENCE, ENTRY TO CORE, IN ORDER.",
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.2,
  // The edge list has to be read before a route can be assembled.
  minHumanMs: 12000,

  generate(band, rng) {
    const depth = band === 2 ? 3 : band === 3 ? 4 : band === 4 ? 4 : 5;
    const width = band <= 3 ? 2 : 3;
    const useBan = band >= 4;

    const labels = rng.sample(NODE_LABELS, depth * width + 2);
    const entry = labels[0];
    const core = labels[1];
    const middle: string[][] = [];
    let cursor = 2;
    for (let d = 0; d < depth; d++) {
      middle.push(labels.slice(cursor, cursor + width));
      cursor += width;
    }

    const layers = [[entry], ...middle, [core]];
    const edges: NodetracePayload["edges"] = [];
    for (let l = 0; l < layers.length - 1; l++) {
      for (const from of layers[l]) {
        for (const to of layers[l + 1]) {
          edges.push({ from, to, cost: rng.int(2, 40) });
        }
      }
    }

    // Interdict one middle node at the top bands. Chosen before the search so
    // the answer honours it.
    const banned = useBan
      ? rng.pick(middle[rng.int(0, middle.length - 1)])
      : null;

    // Layered forward search — every edge advances exactly one layer, so a
    // single sweep is optimal.
    const best = new Map<string, { cost: number; path: string[] }>();
    best.set(entry, { cost: 0, path: [entry] });
    for (let l = 0; l < layers.length - 1; l++) {
      for (const to of layers[l + 1]) {
        if (to === banned) continue;
        let winner: { cost: number; path: string[] } | null = null;
        for (const from of layers[l]) {
          if (from === banned) continue;
          const prev = best.get(from);
          if (!prev) continue;
          const edge = edges.find((e) => e.from === from && e.to === to);
          if (!edge) continue;
          const cost = prev.cost + edge.cost;
          if (!winner || cost < winner.cost) {
            winner = { cost, path: [...prev.path, to] };
          }
        }
        if (winner) best.set(to, winner);
      }
    }

    const answer = best.get(core);
    // Every layer is fully connected, so a route always survives banning one
    // node in one layer. Guard anyway rather than ship an unwinnable round.
    const path = answer ? answer.path : [entry, core];

    const rule = banned
      ? `LOWEST TOTAL LATENCY, AVOIDING ${banned} (INTERDICTED)`
      : "LOWEST TOTAL LATENCY";

    return {
      payload: {
        nodes: layers.flat(),
        edges: rng.shuffle(edges),
        entry,
        core,
        rule,
        banned,
      } satisfies NodetracePayload,
      solution: { path } satisfies NodetraceSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { path } = solution as NodetraceSolution;
    // Ordered, and normalizeList preserves first-seen order.
    const given = normalizeList(answer);
    return {
      correct:
        given.length === path.length &&
        given.every((node, i) => node === path[i]),
    };
  },
};
