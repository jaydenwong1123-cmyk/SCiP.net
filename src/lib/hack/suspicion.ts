import { gameFor } from "@/lib/hack/games";

// Conduct scoring: did a human solve this round?
//
// The honest framing first, because it governs every threshold below. The
// comment at the top of games/types.ts already concedes that any puzzle whose
// inputs must be RENDERED for a human to solve can be read by a script or
// photographed into a vision model. Nothing here contradicts that. What this
// module does is notice the FOOTPRINT that route leaves — a solve faster than
// a person can read the payload, an answer that materialised in one motion
// with no typing behind it, a round spent mostly on another window — and hand
// it to an administrator.
//
// Two tiers of evidence, weighted very differently:
//
//   UNFORGEABLE (40-60 points). Elapsed time, measured between two of the
//   server's own timestamps. A tampered client cannot move either end of it.
//   This tier alone can reach SUSPICION_FLAG_SCORE.
//
//   REPORTED (10-15 points). Keystroke counts, blur time, refused pastes —
//   everything from lib/hack/telemetry.ts. A determined cheat forges these
//   freely, so no combination of them reaches the threshold on its own. Their
//   value is that faking them costs a script, which is a bar the copy-paste
//   cheat this feature is actually losing to does not clear.
//
// NOTHING HERE EVER FAILS A ROUND. It writes a ConductRecord and, past the
// threshold, sets HackRun.flagged so the desk sees a marker. A false positive
// must cost a member a conversation, never a 48-hour cooldown.

export type ConductSignals = {
  // Keystrokes into the answer box.
  k?: number;
  // Pointer interactions with the puzzle.
  p?: number;
  // Refused paste / copy attempts.
  paste?: number;
  copy?: number;
  // Focus losses, and total ms spent off-terminal.
  blurs?: number;
  blurMs?: number;
  // Ms from round start to first input; -1 if there was none.
  t0?: number;
  // Round duration as the client measured it.
  ms?: number;
};

export type ConductScore = {
  score: number;
  reasons: string[];
};

// Parse the telemetry blob defensively. It is attacker-controlled input in the
// most literal sense — the person it describes is the person who sent it — so
// every field is bounds-checked and anything unrecognised is dropped.
export function parseSignals(raw: string): ConductSignals | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const src = parsed as Record<string, unknown>;
    const num = (key: string): number | undefined => {
      const v = src[key];
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    };
    return {
      k: num("k"),
      p: num("p"),
      paste: num("paste"),
      copy: num("copy"),
      blurs: num("blurs"),
      blurMs: num("blurMs"),
      t0: num("t0"),
      ms: num("ms"),
    };
  } catch {
    return null;
  }
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}S`;
}

export type ScoreInput = {
  game: string;
  // Measured from the server's own issue/delivery stamp to now.
  elapsedMs: number;
  answer: string;
  correct: boolean;
  // Raw client telemetry, exactly as submitted.
  rawSignals: string;
};

export function scoreSubmission({
  game,
  elapsedMs,
  answer,
  correct,
  rawSignals,
}: ScoreInput): ConductScore {
  const reasons: string[] = [];
  let score = 0;

  // A wrong answer tells us nothing about how it was produced, and scoring one
  // would punish a member for guessing quickly — which is exactly what the
  // guess-carrying games are FOR. Only a correct answer is evidence.
  if (!correct) return { score: 0, reasons };

  const spec = gameFor(game);
  const floor = spec?.minHumanMs ?? 0;

  // --- Unforgeable tier -----------------------------------------------------

  if (floor > 0 && elapsedMs < floor) {
    // Well under the floor is the strongest signal available anywhere in this
    // feature. Half the floor is not "a fast player"; it is not enough time to
    // have read the payload.
    if (elapsedMs < floor / 2) {
      score += 60;
      reasons.push(
        `SOLVED IN ${seconds(elapsedMs)} - UNDER HALF THE ${seconds(floor)} HUMAN FLOOR`
      );
    } else {
      score += 40;
      reasons.push(
        `SOLVED IN ${seconds(elapsedMs)} - UNDER THE ${seconds(floor)} HUMAN FLOOR`
      );
    }
  }

  // --- Reported tier --------------------------------------------------------

  const s = parseSignals(rawSignals);

  if (!s) {
    // A console that graded a round without sending telemetry is either a very
    // old cached bundle or something that is not the console. Worth noting,
    // not worth much.
    score += 15;
    reasons.push("NO TELEMETRY REPORTED BY THE CLIENT");
    return { score, reasons };
  }

  const typed = answer.replace(/\s+/g, "").length;

  // An answer with real length behind it and no keystrokes to account for it
  // was not typed. Clicked-out answers are the legitimate case, so this only
  // counts when there were no pointer interactions either.
  if (typed >= 4 && (s.k ?? 0) === 0 && (s.p ?? 0) === 0) {
    score += 15;
    reasons.push("ANSWER SUBMITTED WITH NO KEYSTROKES AND NO PICKS");
  }

  if ((s.paste ?? 0) > 0) {
    score += 10;
    reasons.push(`${s.paste} PASTE ATTEMPT(S) REFUSED`);
  }

  if ((s.copy ?? 0) > 0) {
    score += 10;
    reasons.push(`${s.copy} COPY ATTEMPT(S) REFUSED`);
  }

  // Most of the round spent on another window. Innocent on its own — a second
  // monitor, a notification, a screenshot — which is why it is worth 10 and
  // why the console warns about it openly rather than catching anyone out.
  const blurMs = s.blurMs ?? 0;
  if (elapsedMs > 0 && blurMs > elapsedMs * 0.4 && blurMs > 8000) {
    score += 10;
    reasons.push(
      `${seconds(blurMs)} OF ${seconds(elapsedMs)} SPENT OFF-TERMINAL`
    );
  }

  // The answer appeared all at once at the very end: nothing was entered until
  // the last moment, then a complete answer arrived. Consistent with reading a
  // result off another window and transcribing it in one go.
  const t0 = s.t0 ?? -1;
  if (typed >= 4 && t0 >= 0 && elapsedMs > 5000 && t0 > elapsedMs * 0.8) {
    score += 10;
    reasons.push(
      `NO INPUT FOR THE FIRST ${seconds(t0)} OF A ${seconds(elapsedMs)} ROUND`
    );
  }

  return { score, reasons };
}
