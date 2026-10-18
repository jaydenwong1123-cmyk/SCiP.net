// The Chaos Insurgency portal's stations, fed to the same CommandRail the
// Foundation uses. Client-safe, and deliberately separate from lib/sections.ts:
// nothing here names a Foundation route, and nothing there names this one.

import type { Section } from "@/lib/sections";

export const CI_SECTIONS: Section[] = [
  {
    base: "/insurgency",
    label: "UPLINK",
    code: "CI-01",
    desc: "Siege control and operation log",
    group: "operations",
    accent: "red",
  },
  {
    base: "/insurgency/roster",
    label: "ROSTER",
    code: "CI-02",
    desc: "Operatives and their dossiers",
    group: "operations",
  },
  {
    base: "/insurgency/dossier",
    label: "DOSSIER",
    code: "CI-03",
    desc: "Your own operative file",
    group: "operations",
  },
];
