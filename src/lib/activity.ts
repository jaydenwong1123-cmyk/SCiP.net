import { db } from "@/lib/db";

// Visit tracking: when a member was last here, and which days they came.
//
// Two things read it. The station board marks records as NEW when they were
// created after the member's previous session ended, and the owner's
// statistics page counts how many members show up each day. It records a
// timestamp and a calendar day per member and nothing else: no page paths, no
// addresses, no third party.

// A page load inside this window of the last recorded one writes nothing, so
// browsing costs at most one small write every few minutes.
export const VISIT_WRITE_INTERVAL_MS = 5 * 60 * 1000;
// A gap longer than this starts a new session: the old lastSeenAt becomes the
// "previous visit" that NEW markers are measured from.
export const SESSION_GAP_MS = 30 * 60 * 1000;

type VisitFields = {
  id: string;
  lastSeenAt: Date | null;
  prevVisitAt: Date | null;
};

/** "2026-11-13", in UTC, the same clock every stamp on the console uses. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startsNewSession(user: VisitFields, now: Date): boolean {
  return (
    !user.lastSeenAt ||
    now.getTime() - user.lastSeenAt.getTime() > SESSION_GAP_MS
  );
}

/**
 * The instant "new since your last visit" is measured from, or null for a
 * member with no earlier visit on record.
 *
 * Pure, and computed from the member row as it was read for this request, so
 * the layout (which writes the visit) and the page (which reads the marker)
 * agree whichever of them runs first.
 */
export function visitMarker(user: VisitFields, now = new Date()): Date | null {
  return startsNewSession(user, now) ? user.lastSeenAt : user.prevVisitAt;
}

/** Is this record newer than the member's previous visit? */
export function isNewSince(at: Date, marker: Date | null): boolean {
  return marker !== null && at.getTime() > marker.getTime();
}

/**
 * Note that the member is here. Called from the app layout on every page load;
 * writes only when the last write is older than VISIT_WRITE_INTERVAL_MS.
 *
 * Never throws. Losing a visit stamp must not take a page down.
 */
export async function recordVisit(user: VisitFields, now = new Date()): Promise<void> {
  if (
    user.lastSeenAt &&
    now.getTime() - user.lastSeenAt.getTime() < VISIT_WRITE_INTERVAL_MS
  ) {
    return;
  }
  try {
    const today = dayKey(now);
    const newDay = !user.lastSeenAt || dayKey(user.lastSeenAt) !== today;
    await Promise.all([
      db.user.update({
        where: { id: user.id },
        data: {
          lastSeenAt: now,
          ...(startsNewSession(user, now) ? { prevVisitAt: user.lastSeenAt } : {}),
        },
      }),
      newDay
        ? db.activityDay.upsert({
            where: { userId_day: { userId: user.id, day: today } },
            create: { userId: user.id, day: today },
            update: {},
          })
        : Promise.resolve(),
    ]);
  } catch {
    // Deliberately swallowed, see above.
  }
}

/** The last `count` UTC day keys, oldest first, ending today. */
export function recentDayKeys(count: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}
