// ---------------------------------------------------------------------------
// Station registry
//
// Single source of truth for the app's sections. This previously lived in two
// places that had to be kept in sync by hand — the tab strip's SECTIONS list
// and the main menu's tile array — which is why /message-logs had a menu tile
// but no tab. The command rail, the station board and page headers all read
// from here now, so a section can only be added in one place.
//
// This module is imported by the command rail, which is a client component, so
// it must stay free of server-only imports. That is why a station names its
// access GATE as a string rather than carrying a predicate: the real
// predicates (canAccessMessageLogs and friends) reach the database client
// through lib/session, and importing them here would drag it into the browser
// bundle. Gates are resolved once on the server — see resolveGates() in
// lib/sections-access.ts — and the resulting booleans are passed down.
// ---------------------------------------------------------------------------

export type SectionGroup = "operations" | "services" | "restricted" | "session";

/** Access gate names, resolved server-side by lib/sections-access.ts. */
export type Gate =
  | "secureChannel"
  | "messageLogs"
  | "counterIntel"
  | "staff"
  | "helper";

export type Gates = Record<Gate, boolean>;

// Which badge count, if any, a station displays. Counts are fetched once in the
// app layout and passed down; a station names the key it wants rather than
// carrying a query.
export type BadgeKey =
  | "unreadMessages"
  | "openTickets"
  | "pendingRequests"
  | "openCases";

export type BadgeCounts = Partial<Record<BadgeKey, number>>;

export type Section = {
  /** Route prefix. Sub-paths (/scp/123) resolve to this section. */
  base: string;
  label: string;
  /** Station designator shown in the rail and on the board tile. */
  code: string;
  desc: string;
  group: SectionGroup;
  accent?: "amber" | "red";
  badge?: BadgeKey;
  /** Accessible noun for the badge count, e.g. "3 unread". */
  badgeLabel?: string;
  /** Omitted means every authenticated member sees the station. */
  gate?: Gate;
};

export const SECTIONS: Section[] = [
  {
    base: "/personnel",
    label: "PERSONNEL",
    code: "SEC-01",
    desc: "Personnel registry & clearance records",
    group: "operations",
  },
  {
    base: "/messages",
    label: "MESSAGES",
    code: "SEC-02",
    desc: "Encrypted internal correspondence",
    group: "operations",
    badge: "unreadMessages",
    badgeLabel: "unread",
  },
  {
    base: "/scp",
    label: "SCP FILES",
    code: "SEC-03",
    desc: "Anomaly containment documentation",
    group: "operations",
  },
  {
    base: "/incidents",
    label: "INCIDENTS",
    code: "SEC-04",
    desc: "Breach & incident reports",
    group: "operations",
  },
  {
    base: "/broadcasts",
    label: "BROADCASTS",
    code: "SEC-05",
    desc: "Site-wide directives & bulletins",
    group: "operations",
  },
  {
    base: "/forums",
    label: "FORUMS",
    code: "SEC-08",
    desc: "Member discussion threads",
    group: "operations",
  },
  {
    base: "/clearance-request",
    label: "CLEARANCE",
    code: "SEC-06",
    desc: "Request clearance elevation",
    group: "services",
  },
  {
    base: "/tickets",
    label: "IT SUPPORT",
    code: "SEC-07",
    desc: "Assistance, bug reports & file access requests",
    group: "services",
    badge: "openTickets",
    badgeLabel: "open tickets in your queue",
  },
  {
    base: "/secure-channel",
    label: "⚿ SECURE CHANNEL",
    code: "L-5+",
    desc: "Encrypted high-clearance channel",
    group: "restricted",
    accent: "amber",
    gate: "secureChannel",
  },
  {
    base: "/message-logs",
    label: "MESSAGE LOGS",
    code: "R5",
    desc: "Member correspondence oversight",
    group: "restricted",
    accent: "amber",
    gate: "messageLogs",
  },
  {
    // Shown to everyone, unlabelled as to what it actually is. Finding out is
    // the point; the warning screen behind it does the explaining. The label
    // and description here must stay uninformative — do not "fix" them.
    base: "/hack",
    label: "⚠ UNKNOWN TERMINAL",
    code: "???",
    desc: "Unlisted access node — origin unverified",
    group: "restricted",
    accent: "amber",
  },
  {
    base: "/counter-intel",
    label: "COUNTER-INTEL",
    code: "RAISA",
    desc: "Intrusion signals awaiting trace",
    group: "restricted",
    accent: "red",
    badge: "openCases",
    badgeLabel: "unclaimed cases awaiting action",
    gate: "counterIntel",
  },
  {
    // The only station a Helper can reach. Nothing here touches a live run —
    // see the HackDrill comment in schema.prisma — so it is safe at a tier
    // that has no other panel access.
    base: "/training",
    label: "TRAINING RANGE",
    code: "TRN",
    desc: "Countermeasure drills — simulated, no live systems",
    group: "restricted",
    accent: "amber",
    gate: "helper",
  },
  {
    base: "/admin",
    label: "ADMIN",
    code: "ADM",
    desc: "RAISA Control",
    group: "restricted",
    accent: "red",
    badge: "pendingRequests",
    badgeLabel: "pending clearance requests",
    gate: "staff",
  },
  {
    base: "/profile",
    label: "PROFILE",
    code: "USR",
    desc: "Your personnel dossier",
    group: "session",
  },
  {
    base: "/settings",
    label: "SETTINGS",
    code: "CFG",
    desc: "Terminal appearance & preferences",
    group: "session",
  },
];

export const GROUP_LABELS: Record<SectionGroup, string> = {
  operations: "OPERATIONS",
  services: "SERVICES",
  restricted: "RESTRICTED",
  session: "SESSION",
};

export const GROUP_ORDER: SectionGroup[] = [
  "operations",
  "services",
  "restricted",
  "session",
];

/**
 * The station a path belongs to. Longest matching prefix wins, so /scp/123
 * resolves to /scp and a hypothetical /scp-archive would not.
 */
export function sectionFor(path: string): Section | null {
  let best: Section | null = null;
  for (const s of SECTIONS) {
    if (path === s.base || path.startsWith(s.base + "/")) {
      if (!best || s.base.length > best.base.length) best = s;
    }
  }
  return best;
}

/** Same longest-prefix rule, over an already-filtered list. */
export function activeBase(path: string, sections: Section[]): string | null {
  let best: string | null = null;
  for (const s of sections) {
    if (path === s.base || path.startsWith(s.base + "/")) {
      if (!best || s.base.length > best.length) best = s.base;
    }
  }
  return best;
}

/** Stations this member is cleared to see, in registry order. */
export function visibleSections(gates: Gates): Section[] {
  return SECTIONS.filter((s) => !s.gate || gates[s.gate]);
}

export function badgeCount(section: Section, counts: BadgeCounts): number {
  return section.badge ? counts[section.badge] ?? 0 : 0;
}
