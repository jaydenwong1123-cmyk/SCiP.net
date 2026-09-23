import { describe, it, expect } from "vitest";
import { positionOf, sortLadder, type Rung } from "./ranks";

// The rank ladder.
//
// positionOf() is the rule the whole promotion flow turns on: it decides who
// may ask for what, and the approval embed is just a rendering of its answer.
// The cases below are the ones that decide real arguments in a server — the
// unranked recruit, the member sitting at the top, and the ladder that was
// entered out of order.

const rung = (roleId: string, label: string, points: number): Rung => ({
  id: `id-${roleId}`,
  roleId,
  label,
  points,
  requiresApplication: false,
  applicationUrl: "",
});

const LADDER = [
  rung("r3", "Senior Researcher", 250),
  rung("r1", "Junior Researcher", 0),
  rung("r2", "Researcher", 100),
];

describe("sortLadder", () => {
  it("orders rungs by cost, whatever order they were added in", () => {
    expect(sortLadder(LADDER).map((r) => r.label)).toEqual([
      "Junior Researcher",
      "Researcher",
      "Senior Researcher",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const before = LADDER.map((r) => r.roleId);
    sortLadder(LADDER);
    expect(LADDER.map((r) => r.roleId)).toEqual(before);
  });
});

describe("positionOf", () => {
  it("puts an unranked member at the bottom rung, however many points they hold", () => {
    // The promotion is one rung at a time by design — points do not buy a jump
    // to the top of the ladder.
    const where = positionOf(LADDER, 9_000, null);
    expect(where.current).toBeNull();
    expect(where.next?.label).toBe("Junior Researcher");
    expect(where.eligible).toBe(true);
  });

  it("reports the shortfall for a member who cannot afford the next rung", () => {
    const where = positionOf(LADDER, 40, "r1");
    expect(where.current?.label).toBe("Junior Researcher");
    expect(where.next?.label).toBe("Researcher");
    expect(where.eligible).toBe(false);
    expect(where.shortfall).toBe(60);
  });

  it("treats exactly the threshold as eligible", () => {
    const where = positionOf(LADDER, 100, "r1");
    expect(where.eligible).toBe(true);
    expect(where.shortfall).toBe(0);
  });

  it("offers nothing above the top rung", () => {
    const where = positionOf(LADDER, 10_000, "r3");
    expect(where.current?.label).toBe("Senior Researcher");
    expect(where.next).toBeNull();
    expect(where.eligible).toBe(false);
    expect(where.shortfall).toBe(0);
  });

  it("treats a role the bot never granted as unranked", () => {
    // Someone wearing a rank-shaped role handed out by a human before the bot
    // existed. The bot works from what it granted itself, so this reads as the
    // bottom of the ladder rather than as a guess.
    const where = positionOf(LADDER, 300, "some-other-role");
    expect(where.current).toBeNull();
    expect(where.next?.label).toBe("Junior Researcher");
  });

  it("has nothing to offer on an empty ladder", () => {
    const where = positionOf([], 500, null);
    expect(where.current).toBeNull();
    expect(where.next).toBeNull();
    expect(where.eligible).toBe(false);
  });
});
