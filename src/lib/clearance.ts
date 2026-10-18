import type { CSSProperties } from "react";

// The clearance ladder. Seven levels, stored on every member as the integer
// `rank` below:
//
//   L-1  Level-1 Security Clearance (DECLASSIFIED)
//   L-2  Level-2 Security Clearance (RESTRICTED)
//   L-3  Level-3 Security Clearance (CONFIDENTIAL)
//   L-4  Level-4 Security Clearance (TOP SECRET)
//   L-5  Level-5 Security Clearance (COSMIC TOP SECRET)
//   L-6  Level-6 Security Clearance (OMNI)
//   L-7  Level-7 Security Clearance (NULL)
//
// `label` is the compact code, `name` the classification word, `title` the
// formal designation. Gates compare ranks, never strings.
export const CLEARANCE_LEVELS = [
  { rank: 1, label: "L-1", name: "DECLASSIFIED", title: "Level-1 Security Clearance" },
  { rank: 2, label: "L-2", name: "RESTRICTED", title: "Level-2 Security Clearance" },
  { rank: 3, label: "L-3", name: "CONFIDENTIAL", title: "Level-3 Security Clearance" },
  { rank: 4, label: "L-4", name: "TOP SECRET", title: "Level-4 Security Clearance" },
  { rank: 5, label: "L-5", name: "COSMIC TOP SECRET", title: "Level-5 Security Clearance" },
  { rank: 6, label: "L-6", name: "OMNI", title: "Level-6 Security Clearance" },
  { rank: 7, label: "L-7", name: "NULL", title: "Level-7 Security Clearance" },
] as const;

export const MIN_CLEARANCE = 1;
export const MAX_CLEARANCE = 7;
// Members may self-request clearance only up to this level; Level 4 and above
// must be assigned by staff and cannot be requested.
export const MAX_REQUESTABLE_CLEARANCE = 3;
export const OWNER_CLEARANCE = 7;
export const BROADCAST_POST_CLEARANCE = 6;
export const MEMBER_NOTE_CLEARANCE = 6;
export const SECURE_CHANNEL_CLEARANCE = 6;
// Who may open a new forum topic. The forums section itself is visible to
// everyone; this only gates creating one.
export const FORUM_CREATE_CLEARANCE = 6;

export function canAccessSecureChannel(rank: number): boolean {
  return rank >= SECURE_CHANNEL_CLEARANCE;
}

export function canCreateForum(rank: number): boolean {
  return rank >= FORUM_CREATE_CLEARANCE;
}

// The highest rank a terminal intrusion may ever bank. Deliberately below
// OWNER_CLEARANCE: rank 7 is what canBypassRedaction() keys off, and an
// illicit grant must never buy its way past a full redaction.
export const HACK_MAX_TIER = 6;

// The clearance a member may ACT at, as opposed to the one they may read at.
//
// Two features push `clearance` away from the stored rank, in opposite
// directions: "view as" lowers it (see lib/view-as.ts), and an intrusion grant
// raises it (see lib/hack/grant.ts). Reads honor whatever `clearance` says —
// that is the point of both features. Writes must not: an intrusion grant is
// read-only by design, and a member running a simulation should author as the
// persona they are testing, not as themselves.
//
// Taking the minimum satisfies both without either feature having to know the
// other exists. Every value returned by getCurrentUser() carries the
// `realClearance` this needs.
export function authoringClearance(user: {
  clearance: number;
  realClearance: number;
}): number {
  return Math.min(user.clearance, user.realClearance);
}

// The bare code, "L-4", for tight spots like button groups and ranges where the
// classification word would wrap.
export function clearanceCode(rank: number): string {
  return `L-${rank}`;
}

// Compact designation with its classification word: "L-4 (TOP SECRET)". Falls
// back to the bare code for a rank outside the ladder so a corrupt row cannot
// take a page down.
export function clearanceLabel(rank: number): string {
  const level = CLEARANCE_LEVELS.find((l) => l.rank === rank);
  return level ? `${level.label} (${level.name})` : `L-${rank}`;
}

// The formal designation: "Level-4 Security Clearance (TOP SECRET)".
export function clearanceTitle(rank: number): string {
  const level = CLEARANCE_LEVELS.find((l) => l.rank === rank);
  return level ? `${level.title} (${level.name})` : `Level-${rank} Security Clearance`;
}

// R5 is not a clearance level. It is the RAISA administrator designation: a
// role carried by a rank-6 member that confers recordkeeping duties (approving
// redactions, reading the message logs, rewriting personnel files, closing
// counter-intrusion cases). Their clearance is plain L-6.
export const R5_DESIGNATION = "R5";
export const R5_RANK = 6;
export const R5_ROLE_LABEL = "RAISA ADMINISTRATOR";

// Display label for a member: their clearance, plus the administrator role if
// they hold it.
export function clearanceDisplay(
  clearance: number,
  designation?: string | null
): string {
  const label = clearanceLabel(clearance);
  return designation === R5_DESIGNATION ? `${label} · ${R5_ROLE_LABEL}` : label;
}

// Rank accent colors used to tint the terminal chrome, so an L-1 session is
// visually distinguishable from an L-7 one at a glance.
//
// Every level has its own fixed color, so a rank is identifiable by color alone
// and never collides with another rank or with a theme's own palette. Keep them
// unique (clearance.test.ts enforces it).
const CLEARANCE_ACCENTS: Record<number, string> = {
  1: "#9aa0a6",
  2: "#ffcc55",
  3: "#99e6ff",
  4: "#33cc33",
  5: "#8b2fc9",
  6: "#8b0000",
  7: "#ffffff",
};

export function clearanceAccent(clearance: number): string {
  return CLEARANCE_ACCENTS[clearance] ?? "var(--term-fg-dim)";
}

// Inline style that tints a `.clearance-chip` with the color of the level it
// displays. The chip reads --term-clearance, which the app shell sets to the
// VIEWER's accent; without this override every chip on a page (a member's rank
// in the personnel list, a file's required level) would show the viewer's color
// instead of its own.
export function clearanceChipStyle(rank: number): CSSProperties {
  return { ["--term-clearance" as string]: clearanceAccent(rank) };
}

// Selectable clearance options for admin assignment. The administrator role is
// a distinct value from a plain rank 6 even though both resolve to rank 6.
export const CLEARANCE_ASSIGN_OPTIONS = [
  ...CLEARANCE_LEVELS.map((l) => ({
    value: String(l.rank),
    label: clearanceTitle(l.rank),
    rank: l.rank as number,
  })),
  {
    value: R5_DESIGNATION,
    label: `${clearanceTitle(R5_RANK)} + ${R5_ROLE_LABEL}`,
    rank: R5_RANK,
  },
];

// The stored form value for a member's current clearance (the administrator
// designation wins).
export function clearanceAssignValue(
  clearance: number,
  designation?: string | null
): string {
  if (designation === R5_DESIGNATION) return R5_DESIGNATION;
  return String(clearance);
}

// Resolve an admin-submitted assignment value to { clearance, designation }.
export function parseClearanceAssignment(
  value: string
): { clearance: number; designation: string | null } | null {
  if (value === R5_DESIGNATION) {
    return { clearance: R5_RANK, designation: R5_DESIGNATION };
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

// Collapse a classification word to its comparable form: uppercase, with
// whitespace, dashes, underscores and parentheses removed ("Top Secret" ->
// "TOPSECRET"). Dots are deliberately kept so "0.1" can never squash to "01".
function squash(s: string): string {
  return s.toUpperCase().replace(/[\s_()-]/g, "");
}

// Resolve a redaction level token to a clearance rank. Accepts a plain rank
// number or a level in any common form:
//   "4", "L4", "L-4", "LEVEL-4", "Level 4"
//   "TOP SECRET", "COSMIC TOP SECRET", "OMNI", "NULL"
//   "L-4 (TOP SECRET)", "Level-4 Security Clearance (TOP SECRET)"
// A number followed by a classification word must agree ("L-4 RESTRICTED" is
// rejected). Returns null if the token doesn't map to a known level.
export function parseClearanceToken(token: string): number | null {
  const raw = token.trim();
  if (raw === "") return null;

  // A signed token is never a clearance level, and must not be normalized into
  // one. Without this, the dash-stripping below turns "-1" into "1", which then
  // matches L-1 — so a nonsense redaction tag like [*SECRET*][-1] would resolve
  // to the LOWEST rank and be readable by everyone, instead of failing closed
  // to a full redaction the way [*SECRET*][NONSENSE] does. Redaction must fail
  // closed on input it cannot understand.
  if (raw.startsWith("-") || raw.startsWith("+")) return null;

  // Plain rank number (1-7).
  if (/^\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    return n >= MIN_CLEARANCE && n <= MAX_CLEARANCE ? n : null;
  }

  const norm = squash(raw);

  // "L4", "LEVEL4", optionally followed by the classification word.
  const numbered = norm.match(/^(?:LEVEL|L)(\d+)(.*)$/);
  if (numbered) {
    const n = parseInt(numbered[1], 10);
    if (n < MIN_CLEARANCE || n > MAX_CLEARANCE) return null;
    const rest = numbered[2].replace(/^SECURITYCLEARANCE/, "");
    const level = CLEARANCE_LEVELS[n - 1];
    return rest === "" || rest === squash(level.name) ? n : null;
  }

  // The classification word on its own, with or without a leading "L" / "LEVEL"
  // ("TOP SECRET", "L-OMNI"). Anything else — including the retired O5 / E5 /
  // R5 names — falls through to null and so fails closed to a full redaction.
  for (const c of [norm, norm.replace(/^LEVEL/, ""), norm.replace(/^L/, "")]) {
    const match = CLEARANCE_LEVELS.find((l) => squash(l.name) === c);
    if (match) return match.rank;
  }
  return null;
}
