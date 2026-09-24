// THE DIVISIONS.
//
//   Hands of the O5          ┐ handpicked — permission roles, on no ladder
//   Scarlet Representative   ┘
//    ├─ Clerical      LR → MR → HR
//    ├─ Operational   LR → MR → HR
//    └─ Judicial      HR
//         ├─ Judicial Enforcers   ─┐ the top rung of either promotes into
//         └─ Judicial Legislators ─┘ the lowest Judicial HR rung
//
// Fixed in code rather than stored: the structure is the server's constitution,
// and a division that could be created from a slash command could also be
// created by mistake. Each division's ROLES, channels and ranks are configured
// from Discord; which divisions exist is not.

export const DIVISION_KEYS = [
  "clerical",
  "operational",
  "judicial",
  "enforcers",
  "legislators",
] as const;

export type DivisionKey = (typeof DIVISION_KEYS)[number];

export type Division = {
  label: string;
  /** The division whose lowest rung sits above this one's top rung. A member
   *  who climbs past the top here is promoted into it, not transferred. */
  feedsInto: DivisionKey | null;
  /** The division whose HR also reviews this one — itself for a main branch,
   *  the parent for a subdivision. */
  parent: DivisionKey;
};

export const DIVISIONS: Record<DivisionKey, Division> = {
  clerical: { label: "Clerical", feedsInto: null, parent: "clerical" },
  operational: { label: "Operational", feedsInto: null, parent: "operational" },
  judicial: { label: "Judicial", feedsInto: null, parent: "judicial" },
  enforcers: {
    label: "Judicial Enforcers",
    feedsInto: "judicial",
    parent: "judicial",
  },
  legislators: {
    label: "Judicial Legislators",
    feedsInto: "judicial",
    parent: "judicial",
  },
};

export function isDivision(value: unknown): value is DivisionKey {
  return (
    typeof value === "string" &&
    (DIVISION_KEYS as readonly string[]).includes(value)
  );
}

export const divisionLabel = (key: string | null | undefined): string =>
  key && isDivision(key) ? DIVISIONS[key].label : "No division";

/** Slash-command choices for a `division` option. */
export const DIVISION_CHOICES = DIVISION_KEYS.map((key) => ({
  name: DIVISIONS[key].label,
  value: key,
}));

export const BANDS = ["LR", "MR", "HR"] as const;
