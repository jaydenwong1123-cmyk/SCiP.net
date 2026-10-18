import { describe, it, expect } from "vitest";
import {
  drainAmount,
  clampIntegrity,
  isSiegeDue,
  outcomeFor,
  leakTierFor,
  mainframeOpen,
  restoresOnline,
  isTooFast,
  isValidDuration,
  cooldownState,
  isSystemLocked,
  isDefaced,
  hintSaysQuiet,
  lockHorizon,
  type SystemState,
} from "./siege";
import {
  CI_HIT,
  CI_MISS_PENALTY,
  RAISA_HEAL,
  SIEGE_DURATIONS_MIN,
  SIEGE_STATUS,
  CI_BAND,
  RAISA_BAND,
} from "./config";
import { CI_SYSTEMS } from "./systems";
import { eligibleGames } from "@/lib/hack/games";

const NOW = new Date("2026-10-17T12:00:00Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);

function sys(system: string, overrides: Partial<SystemState> = {}): SystemState {
  return {
    system,
    integrity: 100,
    maxIntegrity: 100,
    fallenAt: null,
    lockedUntil: null,
    ...overrides,
  };
}

const ALL_UP = CI_SYSTEMS.map((s) => sys(s.id));
const down = (system: string) => sys(system, { integrity: 0, fallenAt: NOW });

describe("drainAmount", () => {
  it("drains on a CI solve and penalises a CI miss", () => {
    expect(drainAmount("ci", true)).toBe(-CI_HIT);
    expect(drainAmount("ci", false)).toBe(CI_MISS_PENALTY);
  });
  it("heals on a RAISA solve and costs nothing on a miss", () => {
    expect(drainAmount("raisa", true)).toBe(RAISA_HEAL);
    expect(drainAmount("raisa", false)).toBe(0);
  });
});

describe("clampIntegrity", () => {
  it("never leaves 0..max", () => {
    expect(clampIntegrity(-15, 100)).toBe(0);
    expect(clampIntegrity(140, 100)).toBe(100);
    expect(clampIntegrity(42, 100)).toBe(42);
  });
});

describe("isSiegeDue", () => {
  it("is due once the clock runs out", () => {
    expect(isSiegeDue({ endsAt: NOW }, ALL_UP, NOW)).toBe(true);
    expect(isSiegeDue({ endsAt: later(1) }, ALL_UP, NOW)).toBe(false);
  });
  it("ends early when every routed system is down", () => {
    const routedDown = CI_SYSTEMS.map((s) =>
      s.id === "mainframe" ? sys(s.id) : down(s.id)
    );
    expect(isSiegeDue({ endsAt: later(60_000) }, routedDown, NOW)).toBe(true);
  });
  it("does not end on a fallen mainframe alone", () => {
    const onlyMainframe = CI_SYSTEMS.map((s) =>
      s.id === "mainframe" ? down(s.id) : sys(s.id)
    );
    expect(isSiegeDue({ endsAt: later(60_000) }, onlyMainframe, NOW)).toBe(false);
  });
});

describe("outcomeFor", () => {
  it("is a CI win if anything is down", () => {
    expect(outcomeFor([down("archives"), sys("comms")])).toBe(SIEGE_STATUS.ciWon);
  });
  it("is held if nothing is down", () => {
    expect(outcomeFor(ALL_UP)).toBe(SIEGE_STATUS.foundationHeld);
  });
});

describe("leakTierFor", () => {
  it("grades by how much fell, and never exceeds L-5", () => {
    expect(leakTierFor(ALL_UP)).toBe(0);
    expect(leakTierFor([down("archives")])).toBe(3);
    expect(leakTierFor([down("archives"), down("comms"), down("personnel")])).toBe(4);
    expect(leakTierFor([down("archives"), down("mainframe")])).toBe(5);
    const everything = CI_SYSTEMS.map((s) => down(s.id));
    expect(leakTierFor(everything)).toBeLessThanOrEqual(5);
  });
});

describe("mainframeOpen", () => {
  it("opens after two routed systems fall", () => {
    expect(mainframeOpen([down("archives"), sys("comms")])).toBe(false);
    expect(mainframeOpen([down("archives"), down("comms")])).toBe(true);
  });
});

describe("restoresOnline", () => {
  it("comes back at a quarter of max", () => {
    expect(restoresOnline(24, 100)).toBe(false);
    expect(restoresOnline(25, 100)).toBe(true);
  });
});

describe("isTooFast", () => {
  it("rejects answers under half the human floor", () => {
    expect(isTooFast(1_000, 4_000)).toBe(true);
    expect(isTooFast(2_000, 4_000)).toBe(false);
  });
});

describe("isValidDuration", () => {
  it("accepts only the offered lengths", () => {
    for (const m of SIEGE_DURATIONS_MIN) expect(isValidDuration(m)).toBe(true);
    expect(isValidDuration(7)).toBe(false);
    expect(isValidDuration(600)).toBe(false);
  });
});

describe("cooldownState", () => {
  it("is ready with no cooldown or a lapsed one", () => {
    expect(cooldownState({ ciCooldownUntil: null }, NOW).ready).toBe(true);
    expect(cooldownState({ ciCooldownUntil: NOW }, NOW).ready).toBe(true);
  });
  it("reports the wait while cooling down", () => {
    const state = cooldownState({ ciCooldownUntil: later(5_000) }, NOW);
    expect(state.ready).toBe(false);
    expect(state.retryAfterMs).toBe(5_000);
  });
});

describe("locks, defacement and hints", () => {
  it("treats a lock as live only while in the future", () => {
    expect(isSystemLocked({ lockedUntil: later(1) }, NOW)).toBe(true);
    expect(isSystemLocked({ lockedUntil: NOW }, NOW)).toBe(false);
    expect(isSystemLocked({ lockedUntil: null }, NOW)).toBe(false);
  });
  it("treats defacement the same way", () => {
    expect(isDefaced({ ciDefacedUntil: later(1) }, NOW)).toBe(true);
    expect(isDefaced({ ciDefacedUntil: null }, NOW)).toBe(false);
  });
  it("is quiet only when nothing is pending", () => {
    const quiet = { ciSiegeEndsAt: null, ciDefacedUntil: null, ciLockHorizon: null };
    expect(hintSaysQuiet(quiet, NOW)).toBe(true);
    // An expired-but-unsettled siege still needs settling.
    expect(hintSaysQuiet({ ...quiet, ciSiegeEndsAt: later(-1) }, NOW)).toBe(false);
    expect(hintSaysQuiet({ ...quiet, ciLockHorizon: later(1) }, NOW)).toBe(false);
    expect(hintSaysQuiet({ ...quiet, ciLockHorizon: later(-1) }, NOW)).toBe(true);
    expect(hintSaysQuiet({ ...quiet, ciDefacedUntil: later(1) }, NOW)).toBe(false);
  });
  it("finds the latest lock", () => {
    expect(lockHorizon([{ lockedUntil: null }])).toBeNull();
    expect(
      lockHorizon([{ lockedUntil: later(1) }, { lockedUntil: later(9) }, { lockedUntil: null }])
    ).toEqual(later(9));
  });
});

describe("puzzle supply", () => {
  it("has games to deal at both siege bands", () => {
    expect(eligibleGames(CI_BAND).length).toBeGreaterThan(0);
    expect(eligibleGames(RAISA_BAND).length).toBeGreaterThan(0);
  });
});
