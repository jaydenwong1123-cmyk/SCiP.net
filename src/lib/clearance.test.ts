import { describe, it, expect } from "vitest";
import {
  authoringClearance,
  parseClearanceToken,
  parseClearanceAssignment,
  clearanceAssignValue,
  clearanceDisplay,
  clearanceLabel,
  canPostBroadcast,
  canAccessSecureChannel,
  MIN_CLEARANCE,
  MAX_CLEARANCE,
  HACK_MAX_TIER,
  OWNER_CLEARANCE,
  MAX_REQUESTABLE_CLEARANCE,
  E5_DESIGNATION,
  R5_DESIGNATION,
  E5_RANK,
  R5_RANK,
} from "./clearance";

// The clearance resolver.
//
// This module decides what every gate in the application sees, so its edge
// cases are the ones most worth pinning down: the two-axis read/write split,
// the alternate rank-6 designations, and the token parser that redaction tags
// are fed through.

describe("authoringClearance", () => {
  it("takes the minimum of effective and real clearance", () => {
    // The invariant the whole two-axis design rests on. An intrusion grant
    // raises `clearance` and must not raise what the member may WRITE; a "view
    // as" simulation lowers it and must lower writes with it. Taking the
    // minimum satisfies both without either feature knowing the other exists.
    expect(authoringClearance({ clearance: 6, realClearance: 2 })).toBe(2);
    expect(authoringClearance({ clearance: 2, realClearance: 6 })).toBe(2);
    expect(authoringClearance({ clearance: 4, realClearance: 4 })).toBe(4);
  });

  it("never lets an intrusion grant buy authoring rights", () => {
    // The concrete case: an L-1 member holding the deepest possible hack grant.
    const withGrant = { clearance: HACK_MAX_TIER, realClearance: 1 };
    expect(authoringClearance(withGrant)).toBe(1);
    expect(canPostBroadcast(authoringClearance(withGrant))).toBe(false);
    expect(canAccessSecureChannel(authoringClearance(withGrant))).toBe(false);
    // ...while reading at the granted tier still works.
    expect(canAccessSecureChannel(withGrant.clearance)).toBe(true);
  });
});

describe("hack tier ceiling", () => {
  it("stays below the rank redaction bypass keys off", () => {
    // canBypassRedaction() triggers at OWNER_CLEARANCE. If a run could ever
    // bank that rank, an illicit grant would read through full redactions —
    // which lib/clearance.ts explicitly promises it cannot.
    expect(HACK_MAX_TIER).toBeLessThan(OWNER_CLEARANCE);
  });
});

describe("parseClearanceToken", () => {
  it("accepts plain rank numbers in range", () => {
    for (let n = MIN_CLEARANCE; n <= MAX_CLEARANCE; n++) {
      expect(parseClearanceToken(String(n))).toBe(n);
    }
  });

  it("rejects out-of-range and malformed tokens", () => {
    for (const bad of ["0", "8", "99", "-1", "", "   ", "L-", "BANANA", "3.5"]) {
      expect(parseClearanceToken(bad)).toBeNull();
    }
  });

  it("accepts clearance labels in every documented spelling", () => {
    // The forms named in the comment on parseClearanceToken.
    expect(parseClearanceToken("L-O5")).toBe(6);
    expect(parseClearanceToken("LO5")).toBe(6);
    expect(parseClearanceToken("O5")).toBe(6);
    expect(parseClearanceToken("L-OMNI")).toBe(7);
    expect(parseClearanceToken("OMNI")).toBe(7);
    expect(parseClearanceToken("L5")).toBe(5);
    expect(parseClearanceToken("l-5")).toBe(5);
  });

  it("maps the alternate rank-6 designations onto rank 6", () => {
    expect(parseClearanceToken(E5_DESIGNATION)).toBe(E5_RANK);
    expect(parseClearanceToken(R5_DESIGNATION)).toBe(R5_RANK);
    expect(E5_RANK).toBe(6);
    expect(R5_RANK).toBe(6);
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseClearanceToken("  4  ")).toBe(4);
    expect(parseClearanceToken(" L-O5 ")).toBe(6);
  });
});

describe("clearance assignment round-trip", () => {
  it("parses every option the admin form offers", () => {
    for (const value of ["1", "2", "3", "4", "5", "6", "7", E5_DESIGNATION, R5_DESIGNATION]) {
      const parsed = parseClearanceAssignment(value);
      expect(parsed, `assignment value ${value} did not parse`).not.toBeNull();
      // Round-trip: the stored form of what we parsed is the value we sent.
      expect(
        clearanceAssignValue(parsed!.clearance, parsed!.designation)
      ).toBe(value);
    }
  });

  it("rejects values outside the range", () => {
    for (const bad of ["0", "8", "", "X", "-3", "3.5"]) {
      expect(parseClearanceAssignment(bad)).toBeNull();
    }
  });

  it("keeps E5 and R5 distinct despite sharing a rank", () => {
    const e5 = parseClearanceAssignment(E5_DESIGNATION)!;
    const r5 = parseClearanceAssignment(R5_DESIGNATION)!;
    expect(e5.clearance).toBe(r5.clearance);
    expect(e5.designation).not.toBe(r5.designation);
    expect(clearanceDisplay(e5.clearance, e5.designation)).toBe("L-E5");
    expect(clearanceDisplay(r5.clearance, r5.designation)).toBe("L-R5");
    // A plain rank 6 must still read as L-O5, not as either designation.
    expect(clearanceDisplay(6, null)).toBe("L-O5");
  });
});

describe("labels", () => {
  it("labels every rank in range", () => {
    expect(clearanceLabel(1)).toBe("L-1");
    expect(clearanceLabel(6)).toBe("L-O5");
    expect(clearanceLabel(7)).toBe("L-OMNI");
  });

  it("degrades rather than throwing on an unknown rank", () => {
    // A corrupt row must not take a page down.
    expect(clearanceLabel(99)).toBe("L-99");
  });
});

describe("self-request ceiling", () => {
  it("caps below the ranks that must be assigned by staff", () => {
    expect(MAX_REQUESTABLE_CLEARANCE).toBeLessThan(MAX_CLEARANCE);
    expect(MAX_REQUESTABLE_CLEARANCE).toBe(3);
  });
});
