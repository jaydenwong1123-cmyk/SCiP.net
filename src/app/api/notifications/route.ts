import { NextResponse } from "next/server";
import { getRealUser } from "@/lib/session";
import {
  getRecentNotifications,
  getUnreadNotificationCount,
} from "@/lib/notifications";

// Never prerendered and never cached: the answer is one member's own alerts.
export const dynamic = "force-dynamic";

// ALERTS — the bell's live feed.
//
// The header bell used to learn about a new alert only when the member loaded
// another page. It now asks this endpoint once a minute while the tab is
// visible, so a reply or a message shows up on a page that is simply left open.
//
// Strictly per-viewer: it returns the caller's own notifications, the same
// rows the app layout already renders for them, and nothing about anyone else.
//
// Like /api/memetic, a signed-out, suspended or Chaos Insurgency session gets
// 204 rather than an error, and the bell treats every non-200 as "no change".
// This route does not go through requireUser(), so it carries its own
// isInsurgent check (see the list in lib/session.ts).
export async function GET() {
  const headers = { "Cache-Control": "no-store, private" };
  const empty = new NextResponse(null, { status: 204, headers });

  const user = await getRealUser();
  if (!user || user.suspended || user.isInsurgent || !user.displayName) {
    return empty;
  }

  const [rows, unread] = await Promise.all([
    getRecentNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  return NextResponse.json(
    {
      unread,
      notifications: rows.map((n) => ({
        id: n.id,
        body: n.body,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt.toISOString().slice(0, 16).replace("T", " "),
      })),
    },
    { headers }
  );
}
