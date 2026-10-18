import { MAINFRAME_MAX, SYSTEM_MAX } from "./config";

// The systems a siege can take down, and which sections of the site each one
// carries. Client-safe: the siege overlay maps the current pathname through
// systemForPath() to decide whether the page under it has just gone dark.

export type CiSystemSpec = {
  id: CiSystemId;
  label: string;
  code: string;
  // Route prefixes that go offline while the system is locked. Empty for the
  // mainframe, which has no page of its own — taking it escalates the leak and
  // the defacement instead.
  routes: readonly string[];
  max: number;
  blurb: string;
};

export type CiSystemId =
  | "archives"
  | "comms"
  | "personnel"
  | "broadcasts"
  | "mainframe";

export const CI_SYSTEMS: readonly CiSystemSpec[] = [
  {
    id: "archives",
    label: "ARCHIVES",
    code: "ARC",
    routes: ["/scp"],
    max: SYSTEM_MAX,
    blurb: "The anomaly archive.",
  },
  {
    id: "comms",
    label: "COMMUNICATIONS",
    code: "COM",
    routes: ["/messages", "/secure-channel"],
    max: SYSTEM_MAX,
    blurb: "Direct messages and the secure channel.",
  },
  {
    id: "personnel",
    label: "PERSONNEL",
    code: "PER",
    routes: ["/personnel"],
    max: SYSTEM_MAX,
    blurb: "The personnel roster and dossiers.",
  },
  {
    id: "broadcasts",
    label: "BROADCASTS",
    code: "BRD",
    routes: ["/broadcasts"],
    max: SYSTEM_MAX,
    blurb: "Site-wide directives.",
  },
  {
    id: "mainframe",
    label: "MAINFRAME",
    code: "MNF",
    routes: [],
    max: MAINFRAME_MAX,
    blurb: "The core. Opens once two systems are down; taking it deepens the leak.",
  },
];

export const CI_SYSTEM_IDS = CI_SYSTEMS.map((s) => s.id);

export function isCiSystem(value: string): value is CiSystemId {
  return (CI_SYSTEM_IDS as string[]).includes(value);
}

export function systemSpec(id: string): CiSystemSpec | null {
  return CI_SYSTEMS.find((s) => s.id === id) ?? null;
}

export function systemLabel(id: string): string {
  return systemSpec(id)?.label ?? id.toUpperCase();
}

// True for a system whose fall takes a section of the site offline.
export function isRoutedSystem(id: string): boolean {
  return (systemSpec(id)?.routes.length ?? 0) > 0;
}

// Which system carries this path, if any. Matched on a "/" boundary so
// "/scp/abc" belongs to the archives and "/scpfoo" does not.
export function systemForPath(pathname: string | null | undefined): CiSystemId | null {
  if (!pathname) return null;
  for (const spec of CI_SYSTEMS) {
    for (const route of spec.routes) {
      if (pathname === route || pathname.startsWith(`${route}/`)) return spec.id;
    }
  }
  return null;
}
