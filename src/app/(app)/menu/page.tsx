import Link from "next/link";
import { requireUser, hasStaffPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { canAccessSecureChannel, clearanceDisplay } from "@/lib/clearance";
import { TICKET_STATUSES, handleableTicketTypes } from "@/lib/tickets";

type Tile = {
  href: string;
  label: string;
  code: string;
  desc: string;
  accent?: "amber" | "red";
  // Count surfaced as a badge on the tile. Omitted or 0 renders nothing.
  badge?: number;
  badgeLabel?: string;
};

export default async function MenuPage() {
  const user = await requireUser();
  const staff = hasStaffPowers(user);

  // Counts backing the tile badges. Fetched together so the menu still costs
  // a single round trip.
  const ticketQueues = handleableTicketTypes(user);

  const [unreadMessages, pendingRequests, openTickets] = await Promise.all([
    db.message.count({ where: { recipientId: user.id, read: false } }),
    staff
      ? db.clearanceRequest.count({ where: { status: "pending" } })
      : Promise.resolve(0),
    // Badge counts only what this member is expected to act on: tickets in a
    // queue they handle, excluding their own.
    ticketQueues.length > 0
      ? db.ticket.count({
          where: {
            type: { in: ticketQueues },
            status: TICKET_STATUSES.open,
            authorId: { not: user.id },
          },
        })
      : Promise.resolve(0),
  ]);

  const tiles: Tile[] = [
    { href: "/personnel", label: "PERSONNEL", code: "SEC-01", desc: "Personnel registry & clearance records" },
    {
      href: "/messages",
      label: "MESSAGES",
      code: "SEC-02",
      desc: "Encrypted internal correspondence",
      badge: unreadMessages,
      badgeLabel: "unread",
    },
    { href: "/scp", label: "SCP FILES", code: "SEC-03", desc: "Anomaly containment documentation" },
    { href: "/incidents", label: "INCIDENTS", code: "SEC-04", desc: "Breach & incident reports" },
    { href: "/broadcasts", label: "BROADCASTS", code: "SEC-05", desc: "Site-wide directives & bulletins" },
    { href: "/clearance-request", label: "CLEARANCE", code: "SEC-06", desc: "Request clearance elevation" },
    {
      href: "/tickets",
      label: "IT SUPPORT",
      code: "SEC-07",
      desc: "Assistance, bug reports & file access requests",
      badge: openTickets,
      badgeLabel: "open tickets in your queue",
    },
  ];

  if (canAccessSecureChannel(user.clearance)) {
    tiles.push({
      href: "/secure-channel",
      label: "⚿ SECURE CHANNEL",
      code: "L-5+",
      desc: "Encrypted high-clearance channel",
      accent: "amber",
    });
  }

  if (staff) {
    tiles.push({
      href: "/admin",
      label: "ADMIN",
      code: "ADM",
      desc: "RAISA Control",
      accent: "red",
      badge: pendingRequests,
      badgeLabel: "pending clearance requests",
    });
  }

  tiles.push({ href: "/profile", label: "PROFILE", code: "USR", desc: "Your personnel dossier" });
  tiles.push({ href: "/settings", label: "SETTINGS", code: "CFG", desc: "Terminal appearance & preferences" });

  return (
    <div className="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-4">
      <div className="text-center">
        <div className="text-lg sm:text-2xl tracking-widest text-[var(--term-fg-bright)]">
          MAIN MENU
        </div>
        <div className="text-xs sm:text-sm text-[var(--term-fg-dim)] mt-1">
          {"// SELECT A MODULE TO CONTINUE"} — CLEARANCE{" "}
          {clearanceDisplay(user.clearance, user.designation)}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {tiles.map((tile) => (
          <Link
            key={tile.href}
            href={tile.href}
            className={`menu-tile term-panel${
              tile.accent === "amber"
                ? " menu-tile--amber"
                : tile.accent === "red"
                  ? " menu-tile--red"
                  : ""
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm sm:text-base tracking-wider text-[var(--term-fg-bright)]">
                {tile.label}
                {!!tile.badge && tile.badge > 0 && (
                  <span
                    className="clearance-chip ml-2 text-[10px] align-middle"
                    // The count is meaningless to a screen reader without the
                    // noun, so the accessible name carries both.
                    aria-label={`${tile.badge} ${tile.badgeLabel ?? "new"}`}
                  >
                    {tile.badge > 99 ? "99+" : tile.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] sm:text-xs text-[var(--term-fg-dim)]">
                [{tile.code}]
              </span>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-[var(--term-fg-dim)] leading-snug">
              {tile.desc}
            </p>
            <div className="mt-3 text-xs text-[var(--term-fg-dim)] menu-tile__prompt">
              {"> ACCESS"} <span className="menu-tile__caret">_</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
