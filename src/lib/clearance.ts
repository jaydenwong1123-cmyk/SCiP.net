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

// E5 is a distinct designation that carries the same access as L-O5 (rank 6).
export const E5_DESIGNATION = "E5";
export const E5_RANK = 6;

// Display label for a member, honoring an alternate designation like E5.
export function clearanceDisplay(
  clearance: number,
  designation?: string | null
): string {
  if (designation === E5_DESIGNATION) return "L-E5";
  return clearanceLabel(clearance);
}

// Selectable clearance options for admin assignment. E5 is a value distinct
// from O5 even though both resolve to rank 6.
export const CLEARANCE_ASSIGN_OPTIONS = [
  { value: "1", label: "L-1", rank: 1 },
  { value: "2", label: "L-2", rank: 2 },
  { value: "3", label: "L-3", rank: 3 },
  { value: "4", label: "L-4", rank: 4 },
  { value: "5", label: "L-5", rank: 5 },
  { value: "6", label: "L-O5", rank: 6 },
  { value: E5_DESIGNATION, label: "L-E5", rank: E5_RANK },
  { value: "7", label: "L-OMNI", rank: 7 },
] as const;

// The stored form value for a member's current clearance (E5 designation wins).
export function clearanceAssignValue(
  clearance: number,
  designation?: string | null
): string {
  return designation === E5_DESIGNATION ? E5_DESIGNATION : String(clearance);
}

// Resolve an admin-submitted assignment value to { clearance, designation }.
export function parseClearanceAssignment(
  value: string
): { clearance: number; designation: string | null } | null {
  if (value === E5_DESIGNATION) {
    return { clearance: E5_RANK, designation: E5_DESIGNATION };
  }
  if (/^\d+$/.test(value)) {
    const n = parseInt(value, 10);
    if (n >= MIN_CLEARANCE && n <= MAX_CLEARANCE) {
      return { clearance: n, designation: null };
    }
  }
  return null;
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
  // E5 shares O5's rank-6 access.
  if (norm === E5_DESIGNATION) return E5_RANK;
  const match = CLEARANCE_LEVELS.find(
    (l) => l.label.toUpperCase().replace(/[\s-]/g, "").replace(/^L/, "") === norm
  );
  return match ? match.rank : null;
}
