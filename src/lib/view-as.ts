import { cookies } from "next/headers";
import { MIN_CLEARANCE } from "@/lib/clearance";

// "View as" — L-5 and above may walk the site as if they held a lower
// clearance, to check what ordinary personnel can actually read. The chosen
// rank lives in a cookie so every server render of the session sees it, and it
// is applied in `getCurrentUser` so no page has to opt in.
//
// The simulation is deliberately total: while it is active the viewer also
// loses their staff/admin/owner flags, because those bypass redaction outright
// and a preview that still reads every redacted block would tell them nothing.
// The Settings page and the revert action read the *real* row, so there is
// always a way back out.
export const VIEW_AS_COOKIE = "scip-view-as";

// Minimum real clearance required to use the feature at all.
export const VIEW_AS_MIN_CLEARANCE = 5;

export function canViewAs(user: { clearance: number }): boolean {
  return user.clearance >= VIEW_AS_MIN_CLEARANCE;
}

// Ranks a given member may drop to: everything strictly below their own.
export function viewAsOptions(realClearance: number): number[] {
  const ranks: number[] = [];
  for (let r = MIN_CLEARANCE; r < realClearance; r++) ranks.push(r);
  return ranks;
}

// The rank this session is currently pretending to hold, or null. Anything
// that isn't a rank strictly below the member's real one is ignored, so a
// hand-edited cookie can never raise access.
export async function getViewAsClearance(user: {
  clearance: number;
}): Promise<number | null> {
  if (!canViewAs(user)) return null;
  const jar = await cookies();
  const raw = jar.get(VIEW_AS_COOKIE)?.value;
  if (!raw || !/^\d+$/.test(raw)) return null;
  const rank = parseInt(raw, 10);
  if (rank < MIN_CLEARANCE || rank >= user.clearance) return null;
  return rank;
}
