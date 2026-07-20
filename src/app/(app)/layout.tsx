import { requireUser } from "@/lib/session";
import { enforceMaintenance } from "@/lib/site-config";
import { TerminalShell } from "@/components/terminal-shell";
import { db } from "@/lib/db";
import { getRecentNotifications, getUnreadNotificationCount } from "@/lib/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Independent gates — run concurrently instead of one after the other so the
  // layout waits on a single round trip, not two stacked ones.
  const [, user] = await Promise.all([enforceMaintenance(), requireUser()]);

  // Drives the header's unread indicator. A count, not a fetch of the rows.
  const [unreadMessages, notificationRows, unreadNotifications] = await Promise.all([
    db.message.count({ where: { recipientId: user.id, read: false } }),
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
      {children}
    </TerminalShell>
  );
}
