import { requireUser } from "@/lib/session";
import { enforceMaintenance } from "@/lib/site-config";
import { TerminalShell } from "@/components/terminal-shell";
import { db } from "@/lib/db";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Independent gates — run concurrently instead of one after the other so the
  // layout waits on a single round trip, not two stacked ones.
  const [, user] = await Promise.all([enforceMaintenance(), requireUser()]);

  // Drives the header's unread indicator. A count, not a fetch of the rows.
  const unreadMessages = await db.message.count({
    where: { recipientId: user.id, read: false },
  });

  return (
    <TerminalShell
      unreadMessages={unreadMessages}
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
