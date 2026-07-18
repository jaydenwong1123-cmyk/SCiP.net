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

export function clearanceLabel(rank: number): string {
  return CLEARANCE_LEVELS.find((l) => l.rank === rank)?.label ?? `L-${rank}`;
}

export function canPostBroadcast(rank: number): boolean {
  return rank >= BROADCAST_POST_CLEARANCE;
}
