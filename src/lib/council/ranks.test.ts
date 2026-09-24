import { describe, it, expect } from "vitest";
import { DIVISION_KEYS, type DivisionKey } from "./divisions";
import { nextStep, type CouncilRung, type Ladders } from "./ranks";

// The division ladders.
//
// nextStep() decides what a member may ask for. The cases that matter: the
// ladders never bleed into one another, and only the Judicial subdivisions
// carry on upward past their top rung, into Judicial HR.

const rung = (
  division: DivisionKey,
  roleId: string,
  points: number
): CouncilRung => ({
  id: `id-${roleId}`,
  division,
  roleId,
  label: roleId,
  points,
  band: "",
  requiresApplication: false,
  applicationUrl: "",
});

const empty = () =>
  Object.fromEntries(DIVISION_KEYS.map((k) => [k, []])) as unknown as Ladders;

const LADDERS: Ladders = {
  ...empty(),
  clerical: [rung("clerical", "c-lr", 0), rung("clerical", "c-mr", 100), rung("clerical", "c-hr", 300)],
  operational: [rung("operational", "o-lr", 0), rung("operational", "o-mr", 50)],
  judicial: [rung("judicial", "j-hr1", 400), rung("judicial", "j-hr2", 600)],
  enforcers: [rung("enforcers", "e-1", 0), rung("enforcers", "e-2", 150)],
  legislators: [rung("legislators", "l-1", 0), rung("legislators", "l-2", 200)],
};

describe("nextStep", () => {
  it("climbs within the member's own division only", () => {
    const at = nextStep(LADDERS, "clerical", 120, "c-lr");
    expect(at.current?.roleId).toBe("c-lr");
    expect(at.next?.roleId).toBe("c-mr");
    expect(at.toDivision).toBe("clerical");
    expect(at.eligible).toBe(true);
  });

  it("does not read a rank from another division's ladder", () => {
    // An Operational role means nothing on the Clerical ladder: unranked there.
    const at = nextStep(LADDERS, "clerical", 500, "o-mr");
    expect(at.current).toBeNull();
    expect(at.next?.roleId).toBe("c-lr");
  });

  it("stops at the top of a main branch — above it is handpicked", () => {
    for (const [division, top] of [
      ["clerical", "c-hr"],
      ["operational", "o-mr"],
      ["judicial", "j-hr2"],
    ] as const) {
      const at = nextStep(LADDERS, division, 10_000, top);
      expect(at.next).toBeNull();
      expect(at.toDivision).toBeNull();
    }
  });

  it("feeds the top Enforcer rung into the lowest Judicial HR rung", () => {
    const at = nextStep(LADDERS, "enforcers", 450, "e-2");
    expect(at.current?.roleId).toBe("e-2");
    expect(at.next?.roleId).toBe("j-hr1");
    expect(at.toDivision).toBe("judicial");
    expect(at.eligible).toBe(true);
  });

  it("feeds the top Legislator rung into Judicial too, with the parent's price", () => {
    const at = nextStep(LADDERS, "legislators", 250, "l-2");
    expect(at.next?.roleId).toBe("j-hr1");
    expect(at.eligible).toBe(false);
    expect(at.shortfall).toBe(150);
  });

  it("does not feed an unranked member of an empty subdivision into Judicial", () => {
    const ladders = { ...LADDERS, enforcers: [] };
    const at = nextStep(ladders, "enforcers", 1_000, null);
    expect(at.next).toBeNull();
    expect(at.toDivision).toBeNull();
  });
});
