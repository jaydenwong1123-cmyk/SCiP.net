// Deliberately dependency-free. The new-ticket form is a Client Component and
// imports the labels and type constants from here, so this module must not
// reach into @/lib/session (which pulls in auth + the DB client). The two role
// predicates below are therefore spelled out rather than imported.
//
// The three kinds of ticket the IT hub accepts. Kept as a const map (mirroring
// AUDIT_ACTIONS / NOTIFICATION_TYPES) rather than a Prisma enum, since SQLite
// has no native enum type.
export const TICKET_TYPES = {
  general: "general",
  bug: "bug",
  scpAccess: "scp_access",
  // Contesting a terminal sanction (lib/hack/sanctions.ts). Routed to Admin
  // and above because that is the only tier that can see the conduct evidence
  // a sanction rests on, and the only tier that can lift one.
  conductAppeal: "conduct_appeal",
} as const;

export type TicketType = (typeof TICKET_TYPES)[keyof typeof TICKET_TYPES];

export const TICKET_STATUSES = {
  open: "open",
  resolved: "resolved",
  denied: "denied",
} as const;

export type TicketStatus =
  (typeof TICKET_STATUSES)[keyof typeof TICKET_STATUSES];

export const TICKET_TYPE_LABELS: Record<string, string> = {
  [TICKET_TYPES.general]: "GENERAL ASSISTANCE",
  [TICKET_TYPES.bug]: "BUG REPORT",
  [TICKET_TYPES.scpAccess]: "SCP FILE ACCESS REQUEST",
  [TICKET_TYPES.conductAppeal]: "CONDUCT REVIEW APPEAL",
};

export const TICKET_TYPE_DESCRIPTIONS: Record<string, string> = {
  [TICKET_TYPES.general]:
    "Questions, account trouble, or anything else you need a hand with.",
  [TICKET_TYPES.bug]:
    "Something on the network is broken or behaving incorrectly.",
  [TICKET_TYPES.scpAccess]:
    "Request temporary read access to a single SCP file above your clearance.",
  // Worded to describe the SANCTION, which the member has been told about, and
  // never the conduct flag, which they have not. The flag is deliberately
  // silent — see lib/hack/conduct.ts — and this description must not become the
  // thing that tells them it exists.
  [TICKET_TYPES.conductAppeal]:
    "Contest a restriction or blacklist placed on your terminal access.",
};

export function isValidTicketType(value: string): value is TicketType {
  return (Object.values(TICKET_TYPES) as string[]).includes(value);
}

// Departments whose members may raise an SCP file access request. Everyone
// else files General Assistance or Bug Report only.
export const SCP_REQUEST_DEPARTMENTS = [
  "Facility Enforcement",
  "Scientific Department",
] as const;

export function canRequestScpAccess(user: { department: string | null }): boolean {
  return (SCP_REQUEST_DEPARTMENTS as readonly string[]).includes(
    user.department ?? ""
  );
}

// ---------------------------------------------------------------------------
// Queue visibility
//
// Each ticket type routes to exactly one audience:
//   general     → Helper and above (helper, staff, admin, co-owner, owner)
//   bug         → the seeded Owner alone. Deliberately NOT owner-equivalent:
//                 the Co-Owner does not see these, because "owner powers"
//                 elsewhere means authority, and this is an inbox.
//   scp_access  → Admin and above (admin, co-owner, owner). Approving one of
//                 these issues a temporary access grant, and granting access is
//                 an Admin power, so Staff do not work this queue either.
//   conduct_appeal → Admin and above. Two reasons, both binding: the conduct
//                 evidence an appeal argues about lives in ConductRecord, which
//                 /admin/conduct gates at Admin+ because its rows are
//                 name-keyed; and lifting a sanction is the same power as
//                 issuing one. A Helper reading these would see neither the
//                 evidence nor be able to act — and RAISA, who can see the case,
//                 is deliberately kept out of discipline entirely (see
//                 lib/counter-intel.ts).
//
// A ticket's own author can always read their own ticket regardless of type —
// that is `canViewTicket`, below.
// ---------------------------------------------------------------------------

type Viewer = {
  id: string;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isHelper: boolean;
};

// Mirrors hasAdminPowers / hasStaffPowers / hasHelperPowers in @/lib/session.
// Kept local so this module stays importable from Client Components.
function adminOrAbove(v: Viewer): boolean {
  return v.isOwner || v.isCoOwner || v.isAdmin;
}

function staffOrAbove(v: Viewer): boolean {
  return adminOrAbove(v) || v.isStaff;
}

function helperOrAbove(v: Viewer): boolean {
  return staffOrAbove(v) || v.isHelper;
}

// May this viewer work the queue for tickets of this type (read others'
// tickets, reply as support, and close them)?
export function canHandleTicketType(viewer: Viewer, type: string): boolean {
  switch (type) {
    case TICKET_TYPES.general:
      return helperOrAbove(viewer);
    case TICKET_TYPES.bug:
      return viewer.isOwner;
    case TICKET_TYPES.scpAccess:
      return adminOrAbove(viewer);
    case TICKET_TYPES.conductAppeal:
      return adminOrAbove(viewer);
    default:
      return false;
  }
}

// Every ticket type this viewer can see in the queue. Drives both the hub
// listing and the "no queue access" empty state.
export function handleableTicketTypes(viewer: Viewer): TicketType[] {
  return (Object.values(TICKET_TYPES) as TicketType[]).filter((t) =>
    canHandleTicketType(viewer, t)
  );
}

export function canViewTicket(
  viewer: Viewer,
  ticket: { authorId: string; type: string }
): boolean {
  return (
    ticket.authorId === viewer.id || canHandleTicketType(viewer, ticket.type)
  );
}

export const MIN_TICKET_GRANT_DAYS = 1;
export const MAX_TICKET_GRANT_DAYS = 30;

export function statusColor(status: string): string {
  if (status === TICKET_STATUSES.resolved) return "var(--term-fg-bright)";
  if (status === TICKET_STATUSES.denied) return "var(--term-red)";
  return "var(--term-amber)";
}
