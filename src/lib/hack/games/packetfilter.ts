import type { HackGame } from "./types";
import { normalizeList, sameSet } from "./types";
import { NODE_LABELS } from "@/lib/hack/wordlist";

export type PacketfilterPayload = {
  rules: { index: number; action: "ACCEPT" | "DROP"; host: string; port: string }[];
  packets: { id: string; host: string; port: number }[];
};

type PacketfilterSolution = { accepted: string[] };

// FIREWALL AUDIT.
//
// First-match-wins rule evaluation over a packet table. The trick is that some
// rules are SHADOWED — a broad rule above a narrow one means the narrow one
// never fires, and a player who evaluates bottom-up or who stops at the first
// rule that merely *looks* relevant will get it wrong.
//
// Wildcards are "*" for host and either "*" or a range for port, both of which
// read naturally in a monospace table.
//
// Ranges are written "LOW TO HIGH" rather than "LOW-HIGH" — a bare hyphen
// reads as a minus sign the moment the low end scrolls out of view in a
// narrow panel, which made ports look negative for no reason.
export const packetfilterGame: HackGame = {
  id: "packetfilter",
  label: "FIREWALL AUDIT",
  brief:
    "FIRST MATCHING RULE WINS, TOP TO BOTTOM. REPORT THE IDS OF EVERY ACCEPTED PACKET.",
  minBand: 2,
  maxBand: 5,
  timeFactor: 1.3,

  generate(band, rng) {
    const ruleCount = band === 2 ? 4 : band === 3 ? 5 : band === 4 ? 7 : 9;
    const packetCount = band === 2 ? 5 : band === 3 ? 6 : band === 4 ? 8 : 10;

    const hosts = rng.sample(NODE_LABELS, 5);

    const rules: PacketfilterPayload["rules"] = [];
    for (let i = 0; i < ruleCount; i++) {
      const wildHost = rng.bool(band >= 4 ? 0.4 : 0.25);
      const wildPort = rng.bool(0.4);
      const low = rng.int(1, 900);
      rules.push({
        index: i + 1,
        action: rng.bool(0.5) ? "ACCEPT" : "DROP",
        host: wildHost ? "*" : rng.pick(hosts),
        port: wildPort ? "*" : `${low} TO ${low + rng.int(50, 400)}`,
      });
    }
    // A terminal catch-all, so every packet has a defined verdict and the
    // puzzle can never turn on an unstated default.
    rules.push({
      index: ruleCount + 1,
      action: "DROP",
      host: "*",
      port: "*",
    });

    const packets = Array.from({ length: packetCount }, (_, i) => ({
      id: `P${i + 1}`,
      host: rng.pick(hosts),
      port: rng.int(1, 1400),
    }));

    const portMatches = (spec: string, port: number) => {
      if (spec === "*") return true;
      const [lo, hi] = spec.split(" TO ").map(Number);
      return port >= lo && port <= hi;
    };

    const accepted = packets
      .filter((packet) => {
        const rule = rules.find(
          (r) =>
            (r.host === "*" || r.host === packet.host) &&
            portMatches(r.port, packet.port)
        );
        return rule?.action === "ACCEPT";
      })
      .map((p) => p.id);

    return {
      payload: { rules, packets } satisfies PacketfilterPayload,
      solution: { accepted } satisfies PacketfilterSolution,
      attempts: 1,
    };
  },

  grade(solution, answer) {
    const { accepted } = solution as PacketfilterSolution;
    const given = normalizeList(answer);
    // An empty ruleset outcome is a legitimate answer; accept "NONE" for it.
    if (accepted.length === 0) {
      return { correct: given.length === 0 || sameSet(given, ["NONE"]) };
    }
    return { correct: sameSet(given, accepted) };
  },
};
