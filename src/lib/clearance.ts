export const CLEARANCE_LEVELS = [
  { rank: 1, label: "L-1" },
  { rank: 2, label: "L-2" },
  { rank: 3, label: "L-3" },
  { rank: 4, label: "L-4" },
  { rank: 5, label: "L-5" },
  { rank: 6, label: "L-O5" },
  { rank: 7, label: "L-OMNI" },
] as const;

export const MIN_CLEARANCE = 1;
export const MAX_CLEARANCE = 7;
export const OWNER_CLEARANCE = 7;
export const BROADCAST_POST_CLEARANCE = 5;
export const MEMBER_NOTE_CLEARANCE = 5;
export const SECURE_CHANNEL_CLEARANCE = 5;

export function canAccessSecureChannel(rank: number): boolean {
  return rank >= SECURE_CHANNEL_CLEARANCE;
}

export function clearanceLabel(rank: number): string {
  return CLEARANCE_LEVELS.find((l) => l.rank === rank)?.label ?? `L-${rank}`;
}

export function canPostBroadcast(rank: number): boolean {
  return rank >= BROADCAST_POST_CLEARANCE;
}

// Resolve a redaction level token to a clearance rank. Accepts either a plain
// rank number ("6") or a clearance label in any common form:
//   "6", "L-O5", "LO5", "O5", "L-OMNI", "OMNI", "L5", "5"
// Returns null if the token doesn't map to a known level.
export function parseClearanceToken(token: string): number | null {
  const raw = token.trim();
  if (raw === "") return null;

  // Plain rank number (1-7).
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n >= MIN_CLEARANCE && n <= MAX_CLEARANCE ? n : null;
  }

  // Normalize label: uppercase, strip spaces / dashes / leading "L".
  const norm = raw.toUpperCase().replace(/[\s-]/g, "").replace(/^L/, "");
  const match = CLEARANCE_LEVELS.find(
    (l) => l.label.toUpperCase().replace(/[\s-]/g, "").replace(/^L/, "") === norm
  );
  return match ? match.rank : null;
}
