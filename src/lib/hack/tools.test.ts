import { describe, it, expect } from "vitest";
import {
  isToolKind,
  toolsEarnedFor,
  ghostedRevealLevel,
  isSpoofed,
  emptyInventory,
  inventoryTotal,
  TOOL_ORDER,
  TOOL_LABELS,
  TOOL_BRIEFS,
  TOOL_KINDS,
  TOOL_EARN_MIN_STAGE,
  RECOMPILE_TIME_FACTOR,
  MAX_UNUSED_TOOLS,
} from "./tools";
import { REVEAL_MAX, MAX_STAGE } from "./config";

// The pure half of the toolkit. Everything here is a decision function with no
// database behind it; the DB-backed parts (consumeTool's conditional write,
// awardTools' cap) are exercised against a real database rather than mocked.

describe("tool registry", () => {
  it("labels and briefs every kind", () => {
    for (const kind of TOOL_ORDER) {
      expect(TOOL_LABELS[kind]?.length).toBeGreaterThan(0);
      expect(TOOL_BRIEFS[kind]?.length).toBeGreaterThan(0);
    }
  });

  it("lists exactly the declared kinds", () => {
    expect([...TOOL_ORDER].sort()).toEqual(
      [...Object.values(TOOL_KINDS)].sort()
    );
  });

  it("validates kinds strictly", () => {
    for (const kind of TOOL_ORDER) expect(isToolKind(kind)).toBe(true);
    for (const bad of ["", "RECOMPILE", "recompile ", "solve", "__proto__"]) {
      expect(isToolKind(bad)).toBe(false);
    }
  });
});

describe("toolsEarnedFor", () => {
  it("pays nothing above the shallow layers", () => {
    for (let cleared = 0; cleared < TOOL_EARN_MIN_STAGE; cleared++) {
      expect(toolsEarnedFor(cleared)).toBe(0);
    }
  });

  it("pays from the earn floor upward", () => {
    expect(toolsEarnedFor(TOOL_EARN_MIN_STAGE)).toBeGreaterThan(0);
    // Deepest run pays more than the shallowest qualifying one.
    expect(toolsEarnedFor(MAX_STAGE)).toBeGreaterThan(
      toolsEarnedFor(TOOL_EARN_MIN_STAGE)
    );
  });

  it("is monotonic in depth", () => {
    for (let cleared = 1; cleared <= MAX_STAGE; cleared++) {
      expect(toolsEarnedFor(cleared)).toBeGreaterThanOrEqual(
        toolsEarnedFor(cleared - 1)
      );
    }
  });

  it("never pays more in one run than the kit can hold", () => {
    // Otherwise a single deep extraction would silently waste part of its own
    // reward against the cap.
    expect(toolsEarnedFor(MAX_STAGE)).toBeLessThanOrEqual(MAX_UNUSED_TOOLS);
  });
});

describe("ghostedRevealLevel", () => {
  it("rolls back exactly one step", () => {
    expect(ghostedRevealLevel(4)).toBe(3);
    expect(ghostedRevealLevel(1)).toBe(0);
  });

  it("clamps at zero — a case cannot be scrubbed below anonymous", () => {
    expect(ghostedRevealLevel(0)).toBe(0);
    expect(ghostedRevealLevel(-5)).toBe(0);
  });

  it("clamps a corrupt over-max level into range first", () => {
    expect(ghostedRevealLevel(99)).toBe(REVEAL_MAX - 1);
  });
});

describe("isSpoofed", () => {
  const now = 1_000_000;

  it("is false when never spoofed", () => {
    expect(isSpoofed({ spoofedUntil: null }, now)).toBe(false);
  });

  it("is true strictly before the expiry", () => {
    expect(isSpoofed({ spoofedUntil: new Date(now + 1) }, now)).toBe(true);
  });

  it("is false at and after the expiry", () => {
    // Evaluated at query time with no sweep, so the boundary is the only thing
    // that ends a spoof — it has to be right.
    expect(isSpoofed({ spoofedUntil: new Date(now) }, now)).toBe(false);
    expect(isSpoofed({ spoofedUntil: new Date(now - 1) }, now)).toBe(false);
  });
});

describe("inventory", () => {
  it("starts empty across every kind", () => {
    const inv = emptyInventory();
    for (const kind of TOOL_ORDER) expect(inv[kind]).toBe(0);
    expect(inventoryTotal(inv)).toBe(0);
  });

  it("totals every kind", () => {
    const inv = emptyInventory();
    inv.recompile = 2;
    inv.ghost = 1;
    expect(inventoryTotal(inv)).toBe(3);
  });
});

describe("balance invariants", () => {
  it("makes RECOMPILE a real trade, not a free re-roll", () => {
    // A factor of 1.0 or more would make redrawing strictly better than
    // thinking, and the tool would stop being a decision.
    expect(RECOMPILE_TIME_FACTOR).toBeGreaterThan(0);
    expect(RECOMPILE_TIME_FACTOR).toBeLessThan(1);
  });
});
