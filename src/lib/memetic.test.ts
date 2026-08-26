import { describe, it, expect } from "vitest";
import type { SiteConfig } from "./site-config";
import {
  activeMemetic,
  memeticFor,
  clampExposureSeconds,
  formatExposure,
  MEMETIC_CADENCES,
  MIN_EXPOSURE_SECONDS,
  MAX_EXPOSURE_SECONDS,
} from "./memetic";

// Only the memetic columns matter here; the rest of the singleton is filler.
function cfg(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    id: "singleton",
    maintenanceMode: false,
    bypassCode: "",
    maintenanceMessage: "",
    lockdownUntil: null,
    shutdownMode: false,
    shutdownMessage: "",
    shutdownAt: null,
    omegaArmedOp: null,
    omegaArmedAt: null,
    omegaArmedBy: null,
    quartermasterFrom: "",
    quartermasterTo: "",
    quartermasterSetById: null,
    memeticTargetId: "user-1",
    memeticAgent: "abyss",
    memeticCadence: "pulse",
    memeticEndsAt: new Date(Date.now() + 30_000),
    memeticIssuedById: "owner-1",
    ...overrides,
  };
}

describe("activeMemetic", () => {
  it("resolves a well-formed live exposure", () => {
    const live = activeMemetic(cfg());
    expect(live?.targetId).toBe("user-1");
    expect(live?.agent.slug).toBe("abyss");
    expect(live?.cadence.slug).toBe("pulse");
  });

  // Every case below is a row that must read as "nobody is under exposure".
  // A half-written row resolving to a partial exposure is how someone ends up
  // with a full-screen overlay that has no end and no agent behind it.
  it("reads a lapsed end as no exposure", () => {
    expect(activeMemetic(cfg({ memeticEndsAt: new Date(Date.now() - 1) }))).toBeNull();
  });

  it("reads a missing target as no exposure", () => {
    expect(activeMemetic(cfg({ memeticTargetId: null }))).toBeNull();
    expect(activeMemetic(cfg({ memeticTargetId: "" }))).toBeNull();
  });

  it("reads a missing end as no exposure", () => {
    expect(activeMemetic(cfg({ memeticEndsAt: null }))).toBeNull();
  });

  it("reads an unrecognised agent or cadence as no exposure", () => {
    expect(activeMemetic(cfg({ memeticAgent: "retired-plate" }))).toBeNull();
    expect(activeMemetic(cfg({ memeticCadence: "strobe" }))).toBeNull();
    expect(activeMemetic(cfg({ memeticAgent: "" }))).toBeNull();
  });
});

describe("memeticFor", () => {
  it("only answers for the member it is aimed at", () => {
    expect(memeticFor(cfg(), "user-1")).not.toBeNull();
    expect(memeticFor(cfg(), "user-2")).toBeNull();
    expect(memeticFor(cfg(), null)).toBeNull();
    expect(memeticFor(cfg(), undefined)).toBeNull();
  });
});

describe("clampExposureSeconds", () => {
  it("keeps a duration inside the permitted range", () => {
    expect(clampExposureSeconds(30)).toBe(30);
    expect(clampExposureSeconds(0)).toBe(MIN_EXPOSURE_SECONDS);
    expect(clampExposureSeconds(-500)).toBe(MIN_EXPOSURE_SECONDS);
    expect(clampExposureSeconds(999_999)).toBe(MAX_EXPOSURE_SECONDS);
  });

  it("floors fractions and reads junk as the minimum", () => {
    expect(clampExposureSeconds("12.9")).toBe(12);
    expect(clampExposureSeconds("forever")).toBe(MIN_EXPOSURE_SECONDS);
    expect(clampExposureSeconds(null)).toBe(MIN_EXPOSURE_SECONDS);
    expect(clampExposureSeconds(undefined)).toBe(MIN_EXPOSURE_SECONDS);
  });
});

describe("cadence catalogue", () => {
  // The one guarantee on this page that protects the person on the other end:
  // no offered cadence may complete more than three light-dark transitions per
  // second. Half-periods below ~167ms would cross it.
  it("offers nothing faster than 3 Hz", () => {
    for (const c of MEMETIC_CADENCES) {
      expect(c.periodMs).toBeGreaterThanOrEqual(166);
    }
  });
});

describe("formatExposure", () => {
  it("reads as a duration at every scale", () => {
    expect(formatExposure(9)).toBe("9s");
    expect(formatExposure(60)).toBe("1m");
    expect(formatExposure(200)).toBe("3m 20s");
    expect(formatExposure(3600)).toBe("1h 00m");
    expect(formatExposure(7500)).toBe("2h 05m");
  });
});
