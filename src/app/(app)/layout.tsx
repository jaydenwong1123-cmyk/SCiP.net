import Link from "next/link";
import { requireUser } from "@/lib/session";
import { clearanceLabel } from "@/lib/clearance";
import { enforceMaintenance } from "@/lib/site-config";
import { TerminalShell } from "@/components/terminal-shell";
import { db } from "@/lib/db";
import { getRecentNotifications, getUnreadNotificationCount } from "@/lib/notifications";
import { messageRetentionCutoff } from "@/lib/message-retention";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Independent gates — run concurrently instead of one after the other so the
  // layout waits on a single round trip, not two stacked ones.
  const [, user] = await Promise.all([enforceMaintenance(), requireUser()]);

  // Drives the header's unread indicator. A count, not a fetch of the rows.
  const [unreadMessages, notificationRows, unreadNotifications] = await Promise.all([
    db.message.count({
      where: {
        recipientId: user.id,
        read: false,
        createdAt: { gte: messageRetentionCutoff() },
      },
    }),
    getRecentNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  const notifications = notificationRows.map((n) => ({
    id: n.id,
    body: n.body,
    link: n.link,
    read: n.read,
    createdAt: n.createdAt.toISOString().slice(0, 16).replace("T", " "),
  }));

  return (
    <TerminalShell
      unreadMessages={unreadMessages}
      notifications={notifications}
      unreadNotifications={unreadNotifications}
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
      {user.viewAsClearance !== null && (
        <div className="term-panel mb-3 flex flex-wrap items-center justify-between gap-2 border-[var(--term-amber)] text-xs">
          <span className="text-[var(--term-amber)]">
            ⚠ SIMULATING {clearanceLabel(user.viewAsClearance)} — ELEVATED ACCESS
            SUSPENDED (ACTUAL: {clearanceLabel(user.realClearance)})
          </span>
          <Link href="/settings" className="term-link">
            [END SIMULATION]
          </Link>
        </div>
      )}
      {children}
    </TerminalShell>
  );
}
