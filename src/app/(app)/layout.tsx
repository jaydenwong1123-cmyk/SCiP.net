import Link from "next/link";
import { requireUser, enforceSentinel } from "@/lib/session";
import { clearanceLabel } from "@/lib/clearance";
import { formatDuration } from "@/lib/hack/config";
import { enforceMaintenance, enforceShutdown } from "@/lib/site-config";
import { TerminalShell } from "@/components/terminal-shell";
import { db } from "@/lib/db";
import { getRecentNotifications, getUnreadNotificationCount } from "@/lib/notifications";
import { messageRetentionCutoff } from "@/lib/message-retention";
import { resolveGates } from "@/lib/sections-access";
import { visibleSections, type BadgeCounts } from "@/lib/sections";
import { getStationCounts } from "@/lib/station-counts";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Independent gates — run concurrently instead of one after the other so the
  // layout waits on a single round trip, not two stacked ones. Each of these
  // redirects rather than returning, so ordering between them only decides
  // which notice a member meets first, not whether they are stopped.
  const [, , , user] = await Promise.all([
    enforceMaintenance(),
    enforceShutdown(),
    enforceSentinel(),
    requireUser(),
  ]);

  const gates = resolveGates(user);

  // Badge counts for the command rail. These used to be fetched by the menu
  // page alone; the rail shows the same numbers on every route, so they moved
  // up here and the menu now reads them from the shared helper's cache rather
  // than issuing its own queries.
  const [unreadMessages, notificationRows, unreadNotifications, counts] =
    await Promise.all([
      db.message.count({
        where: {
          recipientId: user.id,
          read: false,
          createdAt: { gte: messageRetentionCutoff() },
        },
      }),
      getRecentNotifications(user.id),
      getUnreadNotificationCount(user.id),
      getStationCounts(user),
    ]);

  const badgeCounts: BadgeCounts = { ...counts, unreadMessages };

  // eslint-disable-next-line react-hooks/purity -- server component; single read of wall-clock for expiry display
  const now = Date.now();

  const notifications = notificationRows.map((n) => ({
    id: n.id,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString().slice(0, 16).replace("T", " "),
  }));

  const banners = (
    <>
      {user.viewAsClearance !== null && (
        <div className="hud-banner hud-banner--alert">
          <span>
            ⚠ SIMULATING {clearanceLabel(user.viewAsClearance)} — ELEVATED ACCESS
            SUSPENDED (ACTUAL: {clearanceLabel(user.realClearance)})
          </span>
          <Link href="/settings" className="term-link">
            [END SIMULATION]
          </Link>
        </div>
      )}
      {user.hackClearance !== null && (
        <div className="hud-banner hud-banner--alert-red">
          <span>
            ⚠ ELEVATED SESSION — {clearanceLabel(user.hackClearance)} READ ACCESS,
            UNSANCTIONED. AUTHORING RESTRICTED TO{" "}
            {clearanceLabel(user.realClearance)}.
            {user.hackGrantExpiresAt &&
              ` EXPIRES IN ${formatDuration(
                user.hackGrantExpiresAt.getTime() - now
              )}.`}
          </span>
          <Link href="/hack" className="term-link">
            [TERMINAL]
          </Link>
        </div>
      )}
    </>
  );

  return (
    <TerminalShell
      sections={visibleSections(gates)}
      counts={badgeCounts}
      unreadMessages={unreadMessages}
      notifications={notifications}
      unreadNotifications={unreadNotifications}
      banners={banners}
      user={{
        displayName: user.displayName,
        clearance: user.clearance,
        designation: user.designation,
        isOwner: user.isOwner,
        isCoOwner: user.isCoOwner,
        isAdmin: user.isAdmin,
        isStaff: user.isStaff,
      }}
    >
      {children}
    </TerminalShell>
  );
}
