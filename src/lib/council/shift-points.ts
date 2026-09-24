// SHIFT TIME → POINTS.
//
// The Crimson Hand's conversion table, as written for the bot in Python and
// ported line for line. Whole minutes in, points out; seconds are dropped.
//
//    under 10 min   0
//   10 – 17 min     ½   (the "special" bracket)
//   18 – 35 min     1
//   36 – 54 min     2
//   55 – 60 min     4
//   past 60 min     4, +1 for every further 10 minutes — a block counts once
//                   8 of its 10 minutes are served — and a one-off +2 bonus
//                   once 6 blocks (another hour) are in
//
// Each bracket starts a little early (−2, −4, −5 minutes): that grace is part
// of the original rules, not rounding.
//
// One change from the script: it took 60 off `time` inside the first branch and
// then checked the special bracket against what was left, so a 70–77 minute
// shift also picked up the ½. The special bracket is checked against the real
// length here.

const BRACKET_1 = 20;
const BRACKET_2 = 40;
const BRACKET_3 = 60;
const BRACKET_SPECIAL = 10;

/** Minutes of a started 10-minute block that make it count. */
const BLOCK_GRACE = 8;
/** Overtime blocks needed for the bonus. */
const BONUS_BLOCKS = 6;
const BONUS = 2;

export function shiftPoints(minutes: number): number {
  const time = Math.max(0, Math.floor(minutes));

  if (time >= BRACKET_3 - 5) {
    let points = 4;
    const overtime = time - BRACKET_3;
    if (overtime > 1) {
      let blocks = Math.floor(overtime / 10);
      if (overtime % 10 >= BLOCK_GRACE) blocks += 1;
      if (blocks >= BONUS_BLOCKS) points += BONUS;
      points += blocks;
    }
    return points;
  }
  if (time >= BRACKET_2 - 4) return 2;
  if (time >= BRACKET_1 - 2) return 1;
  if (time >= BRACKET_SPECIAL) return 0.5;
  return 0;
}

/** "8 hours, 7 minutes, 2 seconds" — zero parts left out. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const parts: [number, string][] = [
    [Math.floor(s / 3600), "hour"],
    [Math.floor((s % 3600) / 60), "minute"],
    [s % 60, "second"],
  ];
  const shown = parts
    .filter(([n]) => n > 0)
    .map(([n, unit]) => `${n} ${unit}${n === 1 ? "" : "s"}`);
  return shown.length ? shown.join(", ") : "0 seconds";
}

/** Longest time /shift admin may set or add in one go: one week. */
export const MAX_ADJUST_MINUTES = 7 * 24 * 60;

/**
 * Minutes typed into the /shift admin time boxes: "90", "1h30m", "1h 30m",
 * "2h", "45m" or "1:30". Null when it is none of those or is out of range.
 */
export function parseMinutes(input: string): number | null {
  const value = input.trim().toLowerCase().replace(/\s+/g, "");
  let minutes: number | null = null;

  if (/^\d+$/.test(value)) {
    minutes = Number(value);
  } else if (/^\d+:[0-5]\d$/.test(value)) {
    const [h, m] = value.split(":").map(Number);
    minutes = h * 60 + m;
  } else {
    const match = /^(?:(\d+)h(?:ours?|rs?)?)?(?:(\d+)m(?:in(?:ute)?s?)?)?$/.exec(value);
    if (match && (match[1] || match[2])) {
      minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
    }
  }

  return minutes !== null && minutes <= MAX_ADJUST_MINUTES ? minutes : null;
}
