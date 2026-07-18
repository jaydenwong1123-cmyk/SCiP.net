import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { clearanceLabel } from "@/lib/clearance";

const NAV_ITEMS = [
  { href: "/personnel", label: "PERSONNEL" },
  { href: "/messages", label: "MESSAGES" },
  { href: "/scp", label: "SCP FILES" },
  { href: "/broadcasts", label: "BROADCASTS" },
  { href: "/clearance-request", label: "CLEARANCE" },
];

export function TerminalShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: {
    displayName: string | null;
    clearance: number;
    isOwner: boolean;
    isAdmin: boolean;
    isStaff: boolean;
  };
}) {
  return (
    <div className="min-h-screen flex flex-col max-w-5xl mx-auto p-4 gap-4">
      <header className="term-panel flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-lg tracking-widest">SCiP.NET</span>
          <span className="text-[var(--term-fg-dim)] ml-2">// SECURE TERMINAL</span>
        </div>
        <div className="text-sm flex items-center gap-4">
          <span>
            USER: <span className="text-[var(--term-fg-bright)]">{user.displayName}</span>{" "}
            [{clearanceLabel(user.clearance)}]
          </span>
          {(user.isOwner || user.isAdmin || user.isStaff) && (
            <Link href="/admin" className="term-link">
              ADMIN
            </Link>
          )}
          <Link href="/profile" className="term-link">
            PROFILE
          </Link>
          <LogoutButton />
        </div>
      </header>

      <nav className="term-panel flex flex-wrap gap-4 text-sm">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="term-link">
            [{item.label}]
          </Link>
        ))}
      </nav>

      <main className="flex-1">{children}</main>

      <footer className="text-xs text-[var(--term-fg-dim)] text-center py-2">
        SCP FOUNDATION SECURE ACCESS TERMINAL — UNAUTHORIZED ACCESS WILL BE LOGGED
      </footer>
    </div>
  );
}
