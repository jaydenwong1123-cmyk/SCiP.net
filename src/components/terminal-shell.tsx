import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { clearanceLabel, canAccessSecureChannel } from "@/lib/clearance";
import { Tutorial } from "@/components/tutorial";

const NAV_ITEMS = [
  { href: "/personnel", label: "PERSONNEL" },
  { href: "/messages", label: "MESSAGES" },
  { href: "/scp", label: "SCP FILES" },
  { href: "/incidents", label: "INCIDENTS" },
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
    <div className="min-h-screen flex flex-col max-w-5xl mx-auto p-2 sm:p-4 gap-3 sm:gap-4">
      <header className="term-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <span className="text-base sm:text-lg tracking-widest">SCiP.NET</span>
          <span className="hidden sm:inline text-[var(--term-fg-dim)] ml-2">
            {"// SECURE TERMINAL"}
          </span>
        </div>
        <div className="text-xs sm:text-sm flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-4">
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
          <Link href="/settings" className="term-link">
            SETTINGS
          </Link>
          <LogoutButton />
        </div>
      </header>

      <nav className="term-panel flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className="term-link">
            [{item.label}]
          </Link>
        ))}
        {canAccessSecureChannel(user.clearance) && (
          <Link
            href="/secure-channel"
            className="term-link text-[var(--term-amber)]"
          >
            [⚿ SECURE CHANNEL]
          </Link>
        )}
        <span className="ml-auto">
          <Tutorial />
        </span>
      </nav>

      <main className="flex-1">{children}</main>

      <footer className="text-xs text-[var(--term-fg-dim)] text-center py-2">
        SCP FOUNDATION SECURE ACCESS TERMINAL — UNAUTHORIZED ACCESS WILL BE LOGGED
      </footer>
    </div>
  );
}
