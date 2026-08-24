import { describe, it, expect } from "vitest";
import {
  isClaimLive,
  claimTtlCutoff,
  unclaimedWhere,
  slaTier,
  caseCode,
  caseResolution,
  isCaseStatus,
  canAccessCounterIntel,
  canDeleteCounterIntelLog,
  canResolveCounterIntelCase,
  CLAIM_TTL_MS,
  SLA_TIERS,
  SLA_LABELS,
  SLA_COLORS,
  SLA_AGING_MS,
  SLA_OVERDUE_MS,
  CASE_STATUSES,
  CASE_RESOLUTIONS,
  RAISA_DEPARTMENT,
} from "./counter-intel";
import { R5_DESIGNATION } from "./clearance";

const NOW = 1_700_000_000_000;
const ago = (ms: number) => new Date(NOW - ms);

const caseRow = (over: Partial<Parameters<typeof slaTier>[0]> = {}) => ({
  caseStatus: CASE_STATUSES.needsAction,
  startedAt: ago(0),
  claimedById: null as string | null,
  claimedAt: null as Date | null,
  ...over,
});

describe("desk access", () => {
  it("is the department string and nothing else", () => {
    // Argued at length in the header of lib/counter-intel.ts: the people who
    // hold discipline power must not also decide whose name gets uncovered.
    // Staff powers deliberately do not open this desk.
    expect(canAccessCounterIntel({ department: RAISA_DEPARTMENT })).toBe(true);
    expect(canAccessCounterIntel({ department: "O5 Command" })).toBe(false);
    expect(canAccessCounterIntel({ department: null })).toBe(false);
  });

  it("gates deleting and resolving behind L-R5 on top of desk membership", () => {
    const officer = { department: RAISA_DEPARTMENT, designation: null };
    const r5 = { department: RAISA_DEPARTMENT, designation: R5_DESIGNATION };
    const outsiderR5 = { department: "O5 Command", designation: R5_DESIGNATION };

    expect(canDeleteCounterIntelLog(officer)).toBe(false);
    expect(canDeleteCounterIntelLog(r5)).toBe(true);
    // The designation alone is not enough — desk membership is still required.
    expect(canDeleteCounterIntelLog(outsiderR5)).toBe(false);

    expect(canResolveCounterIntelCase(officer)).toBe(false);
    expect(canResolveCounterIntelCase(r5)).toBe(true);
  });
});

describe("caseCode", () => {
  it("derives from the run id, never the user id", () => {
    // Two runs by one member must not share a code, or anonymity is defeated
    // by collation alone.
    expect(caseCode("run-aaaaaa")).not.toBe(caseCode("run-bbbbbb"));
  });

  it("is stable and uppercase", () => {
    expect(caseCode("abcdef123456")).toBe(caseCode("abcdef123456"));
    expect(caseCode("abcdef123456")).toMatch(/^INTRUSION-[0-9A-Z]{6}$/);
  });
});

describe("isClaimLive", () => {
  it("is false when never claimed", () => {
    expect(isClaimLive({ claimedById: null, claimedAt: null }, NOW)).toBe(false);
  });

  it("is false when half the pair is missing", () => {
    // A half-written row must read as unclaimed rather than as a claim with no
    // holder or no clock.
    expect(isClaimLive({ claimedById: "u1", claimedAt: null }, NOW)).toBe(false);
    expect(isClaimLive({ claimedById: null, claimedAt: ago(0) }, NOW)).toBe(false);
  });

  it("holds inside the window and lapses outside it", () => {
    expect(
      isClaimLive({ claimedById: "u1", claimedAt: ago(CLAIM_TTL_MS - 1) }, NOW)
    ).toBe(true);
    expect(
      isClaimLive({ claimedById: "u1", claimedAt: ago(CLAIM_TTL_MS) }, NOW)
    ).toBe(false);
    expect(
      isClaimLive({ claimedById: "u1", claimedAt: ago(CLAIM_TTL_MS + 1) }, NOW)
    ).toBe(false);
  });
});

describe("claimTtlCutoff / unclaimedWhere", () => {
  it("puts the cutoff exactly one TTL back", () => {
    expect(claimTtlCutoff(new Date(NOW)).getTime()).toBe(NOW - CLAIM_TTL_MS);
  });

  it("matches both never-claimed and lapsed rows", () => {
    const where = unclaimedWhere(new Date(NOW));
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({ claimedById: null });
    expect(where.OR[1]!.claimedAt!.lt.getTime()).toBe(NOW - CLAIM_TTL_MS);
  });
});

describe("slaTier", () => {
  it("does not apply to a case past NEEDS_ACTION", () => {
    // The SLA measures the queue nobody has picked up, not work in progress.
    for (const status of [CASE_STATUSES.inProgress, CASE_STATUSES.resolved]) {
      expect(
        slaTier(caseRow({ caseStatus: status, startedAt: ago(SLA_OVERDUE_MS * 5) }), NOW)
      ).toBeNull();
    }
  });

  it("does not apply while a claim is live", () => {
    expect(
      slaTier(
        caseRow({
          startedAt: ago(SLA_OVERDUE_MS * 5),
          claimedById: "u1",
          claimedAt: ago(0),
        }),
        NOW
      )
    ).toBeNull();
  });

  it("re-enters the ladder once a claim lapses", () => {
    // The whole point of a bounded claim: a case parked and forgotten must
    // return to the queue at whatever tier its age now warrants, not at FRESH.
    expect(
      slaTier(
        caseRow({
          startedAt: ago(SLA_OVERDUE_MS + 1),
          claimedById: "u1",
          claimedAt: ago(CLAIM_TTL_MS + 1),
        }),
        NOW
      )
    ).toBe(SLA_TIERS.overdue);
  });

  it("escalates with age", () => {
    expect(slaTier(caseRow({ startedAt: ago(0) }), NOW)).toBe(SLA_TIERS.fresh);
    expect(slaTier(caseRow({ startedAt: ago(SLA_AGING_MS - 1) }), NOW)).toBe(
      SLA_TIERS.fresh
    );
    expect(slaTier(caseRow({ startedAt: ago(SLA_AGING_MS) }), NOW)).toBe(
      SLA_TIERS.aging
    );
    expect(slaTier(caseRow({ startedAt: ago(SLA_OVERDUE_MS - 1) }), NOW)).toBe(
      SLA_TIERS.aging
    );
    expect(slaTier(caseRow({ startedAt: ago(SLA_OVERDUE_MS) }), NOW)).toBe(
      SLA_TIERS.overdue
    );
  });

  it("measures from the intrusion, not from the last touch", () => {
    // The clock the desk answers to is the one the intruder started; a case
    // passed over three times is not fresher for it.
    const old = caseRow({ startedAt: ago(SLA_OVERDUE_MS * 3) });
    expect(slaTier(old, NOW)).toBe(SLA_TIERS.overdue);
  });

  it("labels and colours every tier", () => {
    for (const tier of Object.values(SLA_TIERS)) {
      expect(SLA_LABELS[tier]?.length).toBeGreaterThan(0);
      expect(SLA_COLORS[tier]?.length).toBeGreaterThan(0);
    }
  });

  it("orders its thresholds sanely", () => {
    expect(SLA_AGING_MS).toBeLessThan(SLA_OVERDUE_MS);
    // A claim must not outlive the window it is meant to cover work inside.
    expect(CLAIM_TTL_MS).toBeLessThanOrEqual(SLA_OVERDUE_MS);
  });
});

describe("caseStatus validation", () => {
  it("accepts only the declared statuses", () => {
    for (const status of Object.values(CASE_STATUSES)) {
      expect(isCaseStatus(status)).toBe(true);
    }
    for (const bad of ["", "OPEN", "resolved", "__proto__"]) {
      expect(isCaseStatus(bad)).toBe(false);
    }
  });
});

describe("caseResolution", () => {
  const grant = (over: Partial<{ expiresAtMs: number; revoked: boolean }> = {}) => ({
    expiresAtMs: NOW + 1000,
    revoked: false,
    ...over,
  });

  it("reports a live run as an intrusion in progress", () => {
    expect(caseResolution({ status: "active", grant: null }, NOW)).toBe(
      CASE_RESOLUTIONS.active
    );
  });

  it("reports a failed run as repelled", () => {
    expect(caseResolution({ status: "failed", grant: null }, NOW)).toBe(
      CASE_RESOLUTIONS.repelled
    );
    // Extracted but with no grant row is still nothing gained.
    expect(caseResolution({ status: "extracted", grant: null }, NOW)).toBe(
      CASE_RESOLUTIONS.repelled
    );
  });

  it("distinguishes live, expired and revoked access", () => {
    expect(caseResolution({ status: "extracted", grant: grant() }, NOW)).toBe(
      CASE_RESOLUTIONS.accessLive
    );
    expect(
      caseResolution({ status: "extracted", grant: grant({ expiresAtMs: NOW - 1 }) }, NOW)
    ).toBe(CASE_RESOLUTIONS.accessExpired);
    // Revocation outranks expiry — a revoked grant reads as revoked whether or
    // not its clock had already run.
    expect(
      caseResolution(
        { status: "extracted", grant: grant({ revoked: true, expiresAtMs: NOW - 1 }) },
        NOW
      )
    ).toBe(CASE_RESOLUTIONS.accessRevoked);
  });
});
