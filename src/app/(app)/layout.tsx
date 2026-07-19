import { requireUser } from "@/lib/session";
import { enforceMaintenance } from "@/lib/site-config";
import { TerminalShell } from "@/components/terminal-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Independent gates — run concurrently instead of one after the other so the
  // layout waits on a single round trip, not two stacked ones.
  const [, user] = await Promise.all([enforceMaintenance(), requireUser()]);

  return (
    <TerminalShell
      user={{
        displayName: user.displayName,
        clearance: user.clearance,
        designation: user.designation,
        isOwner: user.isOwner,
        isAdmin: user.isAdmin,
        isStaff: user.isStaff,
      }}
    >
      {children}
    </TerminalShell>
  );
}
