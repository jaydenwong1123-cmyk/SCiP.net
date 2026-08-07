import { cache } from "react";
import { db } from "@/lib/db";
import { hasStaffPowers } from "@/lib/session";
import { TICKET_STATUSES, handleableTicketTypes } from "@/lib/tickets";
import { canAccessCounterIntel, REVEAL_MAX } from "@/lib/counter-intel";
import type { BadgeCounts } from "@/lib/sections";

// Badge counts for the command rail and the station board.
//
// These were previously fetched by the menu page alone. The rail shows the
// same numbers on every route, so the fetch moved into the app layout — and is
// wrapped in React `cache()` (the same pattern lib/session.ts uses for
// getCurrentUser) so the menu page reading them again inside the same request
// is free rather than a second round trip.
//
// Every count is gated by the permission that gates the station it belongs to:
// a regular member's request issues one query, not four.

export type CountUser = {
  id: string;
  clearance: number;
  designation: string | null;
  department?: string | null;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isHelper: boolean;
};

export const getStationCounts = cache(
  async (user: CountUser): Promise<BadgeCounts> => {
    const staff = hasStaffPowers(user);
    const ticketQueues = handleableTicketTypes(user);
    const raisa = canAccessCounterIntel(user);

    const [pendingRequests, openTickets, openCases] = await Promise.all([
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
      raisa
        ? db.hackRun.count({ where: { revealLevel: { lt: REVEAL_MAX } } })
        : Promise.resolve(0),
    ]);

    return { pendingRequests, openTickets, openCases };
  }
);
