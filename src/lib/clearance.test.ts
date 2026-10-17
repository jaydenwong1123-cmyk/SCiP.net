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
  CLEARANCE_LEVELS,
  CLEARANCE_ASSIGN_OPTIONS,
  clearanceTitle,
  clearanceCode,
  clearanceAccent,
  R5_DESIGNATION,
  R5_RANK,
} from "./clearance";

// The clearance resolver.
//
// This module decides what every gate in the application sees, so its edge
// cases are the ones most worth pinning down: the two-axis read/write split,
// the L-1..L-7 ladder and its names, the RAISA administrator role, and the
// token parser that redaction tags are fed through.

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

  it("accepts every level name", () => {
    expect(parseClearanceToken("DECLASSIFIED")).toBe(1);
    expect(parseClearanceToken("RESTRICTED")).toBe(2);
    expect(parseClearanceToken("CONFIDENTIAL")).toBe(3);
    expect(parseClearanceToken("TOP SECRET")).toBe(4);
    expect(parseClearanceToken("TOPSECRET")).toBe(4);
    expect(parseClearanceToken("COSMIC TOP SECRET")).toBe(5);
    expect(parseClearanceToken("OMNI")).toBe(6);
    expect(parseClearanceToken("NULL")).toBe(7);
  });

  it("accepts the L- and Level- forms, in any case", () => {
    expect(parseClearanceToken("L5")).toBe(5);
    expect(parseClearanceToken("l-5")).toBe(5);
    expect(parseClearanceToken("Level-4")).toBe(4);
    expect(parseClearanceToken("level 4")).toBe(4);
    expect(parseClearanceToken("L-OMNI")).toBe(6);
    expect(parseClearanceToken("L-NULL")).toBe(7);
    expect(parseClearanceToken("L-4 (TOP SECRET)")).toBe(4);
    expect(parseClearanceToken("Level-4 Security Clearance (TOP SECRET)")).toBe(4);
  });

  it("rejects a number that contradicts its classification word", () => {
    expect(parseClearanceToken("L-4 RESTRICTED")).toBeNull();
    expect(parseClearanceToken("L-9 OMNI")).toBeNull();
  });

  it("no longer recognizes the retired O5 / E5 / R5 names", () => {
    // Old redaction tags that used them fail closed to a full redaction.
    for (const retired of ["L-O5", "LO5", "O5", "L-E5", "E5", "L-R5", "R5", "L-OMNI5"]) {
      expect(parseClearanceToken(retired), retired).toBeNull();
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseClearanceToken("  4  ")).toBe(4);
    expect(parseClearanceToken(" OMNI ")).toBe(6);
  });
});

describe("the L-1 .. L-7 ladder", () => {
  it("defines seven contiguous ranks with the official names", () => {
    expect(CLEARANCE_LEVELS.map((l) => l.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(CLEARANCE_LEVELS.map((l) => l.name)).toEqual([
      "DECLASSIFIED",
      "RESTRICTED",
      "CONFIDENTIAL",
      "TOP SECRET",
      "COSMIC TOP SECRET",
      "OMNI",
      "NULL",
    ]);
    expect(MIN_CLEARANCE).toBe(1);
    expect(MAX_CLEARANCE).toBe(7);
  });

  it("titles every level formally", () => {
    expect(clearanceTitle(1)).toBe("Level-1 Security Clearance (DECLASSIFIED)");
    expect(clearanceTitle(5)).toBe("Level-5 Security Clearance (COSMIC TOP SECRET)");
    expect(clearanceTitle(7)).toBe("Level-7 Security Clearance (NULL)");
  });

  it("gives every rank an accent", () => {
    for (const l of CLEARANCE_LEVELS) {
      expect(clearanceAccent(l.rank)).toBeTruthy();
    }
  });

  it("gives every rank a unique accent", () => {
    const accents = CLEARANCE_LEVELS.map((l) => clearanceAccent(l.rank));
    expect(new Set(accents).size).toBe(CLEARANCE_LEVELS.length);
  });
});

describe("clearance assignment round-trip", () => {
  it("parses every option the admin form offers", () => {
    for (const value of ["1", "2", "3", "4", "5", "6", "7", R5_DESIGNATION]) {
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

  it("offers exactly the seven levels plus the administrator role", () => {
    expect(CLEARANCE_ASSIGN_OPTIONS.map((o) => o.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      R5_DESIGNATION,
    ]);
  });

  it("treats the retired E5 designation as an invalid assignment", () => {
    expect(parseClearanceAssignment("E5")).toBeNull();
  });

  it("keeps the RAISA administrator at rank 6 without changing the clearance", () => {
    const r5 = parseClearanceAssignment(R5_DESIGNATION)!;
    expect(r5.clearance).toBe(R5_RANK);
    expect(R5_RANK).toBe(6);
    expect(r5.designation).toBe(R5_DESIGNATION);
    // The role rides on top of L-6; it is not a clearance level of its own.
    expect(clearanceDisplay(r5.clearance, r5.designation)).toBe(
      "L-6 (OMNI) · RAISA ADMINISTRATOR"
    );
    expect(clearanceDisplay(6, null)).toBe("L-6 (OMNI)");
    // A stale designation left over from the retired system shows nothing extra.
    expect(clearanceDisplay(6, "E5")).toBe("L-6 (OMNI)");
  });
});

describe("labels", () => {
  it("labels every rank in range", () => {
    expect(clearanceLabel(1)).toBe("L-1 (DECLASSIFIED)");
    expect(clearanceLabel(4)).toBe("L-4 (TOP SECRET)");
    expect(clearanceLabel(6)).toBe("L-6 (OMNI)");
    expect(clearanceLabel(7)).toBe("L-7 (NULL)");
  });

  it("offers a bare code for tight spots", () => {
    expect(clearanceCode(4)).toBe("L-4");
    expect(clearanceCode(7)).toBe("L-7");
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
