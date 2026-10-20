import { describe, it, expect } from "vitest";
import { canCommandSetRank, canCreateCiCodes, canHostSiege, ciRankOf } from "./ranks";

const operative = { ciRank: "operative" };
const leader = { ciRank: "squadron_leader" };
const delta = { ciRank: "delta_command" };

describe("ciRankOf", () => {
  it("treats a missing or unknown rank as operative", () => {
    expect(ciRankOf({})).toBe("operative");
    expect(ciRankOf({ ciRank: null })).toBe("operative");
    expect(ciRankOf({ ciRank: "owner" })).toBe("operative");
  });
});

describe("canHostSiege", () => {
  it("allows squadron leaders and delta command only", () => {
    expect(canHostSiege(operative)).toBe(false);
    expect(canHostSiege(leader)).toBe(true);
    expect(canHostSiege(delta)).toBe(true);
    expect(canHostSiege({ ciRank: "bogus" })).toBe(false);
  });
});

describe("canCreateCiCodes", () => {
  it("allows delta command only", () => {
    expect(canCreateCiCodes(operative)).toBe(false);
    expect(canCreateCiCodes(leader)).toBe(false);
    expect(canCreateCiCodes(delta)).toBe(true);
  });
});

describe("canCommandSetRank", () => {
  const dc = { id: "dc", ciRank: "delta_command" };
  const op = { id: "op", ciRank: "operative" };
  const sl = { id: "sl", ciRank: "squadron_leader" };
  const otherDc = { id: "dc2", ciRank: "delta_command" };

  it("lets delta command promote and demote squadron leaders", () => {
    expect(canCommandSetRank(dc, op, "squadron_leader")).toBe(true);
    expect(canCommandSetRank(dc, sl, "operative")).toBe(true);
  });
  it("never grants or strips delta command", () => {
    expect(canCommandSetRank(dc, op, "delta_command")).toBe(false);
    expect(canCommandSetRank(dc, otherDc, "operative")).toBe(false);
  });
  it("refuses self-changes and non-commanders", () => {
    expect(canCommandSetRank(dc, dc, "operative")).toBe(false);
    expect(canCommandSetRank(sl, op, "squadron_leader")).toBe(false);
    expect(canCommandSetRank({ ...op, id: "x" }, op, "squadron_leader")).toBe(false);
  });
  it("rejects unknown ranks", () => {
    expect(canCommandSetRank(dc, op, "owner")).toBe(false);
  });
});
