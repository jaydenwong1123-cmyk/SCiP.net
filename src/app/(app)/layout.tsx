import { requireUser } from "@/lib/session";
import { enforceMaintenance } from "@/lib/site-config";
import { TerminalShell } from "@/components/terminal-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await enforceMaintenance();
  const user = await requireUser();

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
