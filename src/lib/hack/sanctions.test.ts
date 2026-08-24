import { describe, it, expect } from "vitest";
import {
  isSanctionLevel,
  blocksRuns,
  cooldownMultiplier,
  nextLevel,
  sanctionRefusal,
  SANCTION_LEVELS,
  SANCTION_ORDER,
  SANCTION_LABELS,
  SANCTION_BLURBS,
  RESTRICTED_COOLDOWN_MULTIPLIER,
  MIN_SANCTION_DAYS,
  MAX_SANCTION_DAYS,
  type ActiveSanction,
  type SanctionLevel,
} from "./sanctions";

const sanction = (level: SanctionLevel, over: Partial<ActiveSanction> = {}): ActiveSanction => ({
  id: "s1",
  level,
  reason: "TEST",
  expiresAt: null,
  createdAt: new Date(0),
  ...over,
});

describe("sanction ladder", () => {
  it("labels and describes every rung", () => {
    for (const level of SANCTION_ORDER) {
      expect(SANCTION_LABELS[level]?.length).toBeGreaterThan(0);
      expect(SANCTION_BLURBS[level]?.length).toBeGreaterThan(0);
    }
  });

  it("lists exactly the declared levels, in ascending severity", () => {
    expect([...SANCTION_ORDER].sort()).toEqual(
      [...Object.values(SANCTION_LEVELS)].sort()
    );
    expect(SANCTION_ORDER[0]).toBe(SANCTION_LEVELS.warning);
    expect(SANCTION_ORDER[SANCTION_ORDER.length - 1]).toBe(
      SANCTION_LEVELS.blacklisted
    );
  });

  it("validates levels strictly", () => {
    for (const level of SANCTION_ORDER) expect(isSanctionLevel(level)).toBe(true);
    for (const bad of ["", "WARNING", "banned", "suspend", "__proto__"]) {
      expect(isSanctionLevel(bad)).toBe(false);
    }
  });
});

describe("effects", () => {
  it("blocks runs only at the top rung", () => {
    expect(blocksRuns(null)).toBe(false);
    expect(blocksRuns(sanction(SANCTION_LEVELS.warning))).toBe(false);
    expect(blocksRuns(sanction(SANCTION_LEVELS.restricted))).toBe(false);
    expect(blocksRuns(sanction(SANCTION_LEVELS.blacklisted))).toBe(true);
  });

  it("lengthens the cooldown only at the middle rung", () => {
    // A warning is explicitly a no-op on access — that is what makes it usable
    // as a first step rather than a punishment.
    expect(cooldownMultiplier(null)).toBe(1);
    expect(cooldownMultiplier(sanction(SANCTION_LEVELS.warning))).toBe(1);
    expect(cooldownMultiplier(sanction(SANCTION_LEVELS.restricted))).toBe(
      RESTRICTED_COOLDOWN_MULTIPLIER
    );
    // A blacklist stops runs outright, so multiplying the cooldown as well
    // would be meaningless.
    expect(cooldownMultiplier(sanction(SANCTION_LEVELS.blacklisted))).toBe(1);
  });

  it("uses a multiplier that actually lengthens the wait", () => {
    expect(RESTRICTED_COOLDOWN_MULTIPLIER).toBeGreaterThan(1);
  });
});

describe("nextLevel", () => {
  it("starts a clean record at a warning", () => {
    expect(nextLevel(null)).toBe(SANCTION_LEVELS.warning);
  });

  it("walks the ladder one rung at a time", () => {
    expect(nextLevel(sanction(SANCTION_LEVELS.warning))).toBe(
      SANCTION_LEVELS.restricted
    );
    expect(nextLevel(sanction(SANCTION_LEVELS.restricted))).toBe(
      SANCTION_LEVELS.blacklisted
    );
  });

  it("stays at the top rather than running off the end", () => {
    expect(nextLevel(sanction(SANCTION_LEVELS.blacklisted))).toBe(
      SANCTION_LEVELS.blacklisted
    );
  });
});

describe("sanctionRefusal", () => {
  it("states the reason and the route to contest it", () => {
    // The whole reason a sanction is announced rather than silent: an
    // unexplained penalty cannot be appealed.
    const text = sanctionRefusal(
      sanction(SANCTION_LEVELS.blacklisted, { reason: "REPEATED SUB-FLOOR SOLVES" })
    );
    expect(text).toContain("REPEATED SUB-FLOOR SOLVES");
    expect(text).toContain("APPEAL");
  });

  it("says so plainly when there is no expiry", () => {
    const text = sanctionRefusal(sanction(SANCTION_LEVELS.blacklisted));
    expect(text).toContain("NO EXPIRY");
  });

  it("reports the remaining time when there is one", () => {
    const text = sanctionRefusal(
      sanction(SANCTION_LEVELS.blacklisted, {
        expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      })
    );
    expect(text).toContain("LIFTS IN");
    expect(text).toMatch(/\d/);
  });

  it("reads sensibly with no reason recorded", () => {
    const text = sanctionRefusal(sanction(SANCTION_LEVELS.blacklisted, { reason: "" }));
    expect(text).not.toContain("REASON:");
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("duration bounds", () => {
  it("are a sane, ordered range", () => {
    expect(MIN_SANCTION_DAYS).toBeGreaterThan(0);
    expect(MAX_SANCTION_DAYS).toBeGreaterThan(MIN_SANCTION_DAYS);
  });
});
