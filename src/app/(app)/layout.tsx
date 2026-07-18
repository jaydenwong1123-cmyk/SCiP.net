import { requireUser } from "@/lib/session";
import { TerminalShell } from "@/components/terminal-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <TerminalShell
      user={{
        displayName: user.displayName,
        clearance: user.clearance,
        isOwner: user.isOwner,
        isAdmin: user.isAdmin,
      }}
    >
      {children}
    </TerminalShell>
  );
}
