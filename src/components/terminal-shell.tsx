import Link from "next/link";
import { SecretLogo } from "@/components/secret-logo";
import { LogoutButton } from "@/components/logout-button";
import { clearanceDisplay, clearanceAccent } from "@/lib/clearance";
import { Tutorial } from "@/components/tutorial";
import { CommandRail } from "@/components/command-rail";
import { UtcClock } from "@/components/utc-clock";
import { NotificationBell, type NotificationRow } from "@/components/notification-bell";
import { StationBreadcrumb } from "@/components/station-breadcrumb";
import type { BadgeCounts, Section } from "@/lib/sections";

export function TerminalShell({
  children,
  user,
  sections,
  counts,
  unreadMessages = 0,
  notifications = [],
  unreadNotifications = 0,
  banners,
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
  /** Stations this member is cleared to see — already filtered on the server. */
  sections: Section[];
  counts: BadgeCounts;
  unreadMessages?: number;
  notifications?: NotificationRow[];
  unreadNotifications?: number;
  /** Full-bleed session-state strips (view-as simulation, illicit grant). */
  banners?: React.ReactNode;
}) {
  const accent = clearanceAccent(user.clearance, user.designation);
  const rank = clearanceDisplay(user.clearance, user.designation);

  return (
    <div
      className="hud-shell"
      // Scopes the rank accent to the app shell; the rail, stripe and chips
      // all read it through var(--term-clearance).
      style={{ ["--term-clearance" as string]: accent }}
    >
      <CommandRail sections={sections} counts={counts} callsign={rank} />

      <div className="hud-content">
        <div className="hud-banner hud-banner--ts">
          <span>TOP SECRET</span>
          <span aria-hidden>{"//"}</span>
          <span>SCiP-220</span>
          <span aria-hidden>{"//"}</span>
          <span>NOFORN</span>
        </div>

        <header className="hud-statusbar">
          <SecretLogo />
          <span className="hud-statusbar__sep" aria-hidden>
            │
          </span>
          <span className="text-[var(--term-amber)]">FACILITY-220</span>
          <StationBreadcrumb />

          <div className="hud-statusbar__right">
            <UtcClock />
            <span>
              <span className="hidden sm:inline">USER: </span>
              <span className="text-[var(--term-fg-bright)]">{user.displayName}</span>{" "}
              <span className="clearance-chip">{rank}</span>
            </span>
            {unreadMessages > 0 && (
              <Link
                href="/messages"
                className="term-link text-[var(--term-fg-bright)]"
                aria-label={`${unreadMessages} unread ${
                  unreadMessages === 1 ? "message" : "messages"
                }`}
              >
                ✉ {unreadMessages}
              </Link>
            )}
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadNotifications}
            />
            <LogoutButton />
            <Tutorial />
          </div>
        </header>

        <div className="clearance-stripe" aria-hidden />

        {banners}

        <div className="hud-content__inner">
          <main className="flex-1 flex flex-col gap-[var(--term-gap)] min-w-0">
            {children}
          </main>
        </div>

        <footer className="hud-banner hud-banner--ts">
          <span>UNAUTHORIZED DISCLOSURE PUNISHABLE UNDER SITE DIRECTIVE 1-C</span>
        </footer>
      </div>
    </div>
  );
}
