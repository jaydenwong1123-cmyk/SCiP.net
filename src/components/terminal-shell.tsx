import { SecretLogo } from "@/components/secret-logo";
import { LogoutButton } from "@/components/logout-button";
import { clearanceDisplay } from "@/lib/clearance";
import { Tutorial } from "@/components/tutorial";
import { TabBar } from "@/components/tab-bar";

export function TerminalShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: {
    displayName: string | null;
    clearance: number;
    designation: string | null;
    isOwner: boolean;
    isCoOwner: boolean;
    isAdmin: boolean;
    isStaff: boolean;
  };
}) {
  return (
    <div className="min-h-screen flex flex-col w-full max-w-5xl mx-auto p-2 sm:p-4 gap-3 sm:gap-4">
      <header className="term-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <SecretLogo />
          <span className="text-[var(--term-amber)] ml-2">FACILITY-220</span>
          <span className="hidden sm:inline text-[var(--term-fg-dim)] ml-2">
            {"// SECURE TERMINAL"}
          </span>
        </div>
        <div className="text-xs sm:text-sm flex flex-wrap items-center gap-x-3 gap-y-1 sm:gap-4">
          <span>
            USER: <span className="text-[var(--term-fg-bright)]">{user.displayName}</span>{" "}
            [{clearanceDisplay(user.clearance, user.designation)}]
          </span>
          <LogoutButton />
          <Tutorial />
        </div>
      </header>

      <TabBar />

      <main className="flex-1 flex flex-col">{children}</main>

      <footer className="text-xs text-[var(--term-fg-dim)] text-center py-2">
        SCP FOUNDATION SECURE ACCESS TERMINAL — UNAUTHORIZED ACCESS WILL BE LOGGED
      </footer>
    </div>
  );
}
