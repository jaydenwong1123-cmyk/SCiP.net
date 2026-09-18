import { describe, it, expect } from "vitest";
import type { InteractionMember } from "@/lib/discord/types";
import { EMPTY_CONFIG, type EngineConfig } from "./config";
import { Tier, hasTier, isGuildAdmin, tierOf } from "./permissions";
import { clampDelta } from "./points";

// Who may do what.
//
// This is the module that decides whether a stranger can hand themselves a
// thousand points, so its failure mode is not "a command is inconvenient" — it
// is someone rewriting the server's rank structure. The tests below pin the two
// properties that matter: tiers inherit downwards, and nothing falls open when
// a role is left unconfigured.

const CONFIG: EngineConfig = {
  ...EMPTY_CONFIG,
  guildId: "g1",
  staffRoleId: "role-staff",
  commandRoleId: "role-command",
  ownerRoleId: "role-owner",
};

const member = (roles: string[], permissions = "0"): InteractionMember => ({
  user: { id: "u1", username: "agent" },
  roles,
  permissions,
});

const ADMIN_BITS = "8"; // ADMINISTRATOR

describe("tierOf", () => {
  it("reads each configured role as its own tier", () => {
    expect(tierOf(member(["role-staff"]), CONFIG)).toBe(Tier.Staff);
    expect(tierOf(member(["role-command"]), CONFIG)).toBe(Tier.Command);
    expect(tierOf(member(["role-owner"]), CONFIG)).toBe(Tier.Owner);
  });

  it("grants the highest tier a member holds, not the first one found", () => {
    expect(tierOf(member(["role-staff", "role-owner"]), CONFIG)).toBe(Tier.Owner);
  });

  it("gives an ordinary member the base tier when no member role is set", () => {
    expect(tierOf(member(["role-nobody"]), CONFIG)).toBe(Tier.Member);
  });

  it("locks out everyone without the member role once one is set", () => {
    const gated = { ...CONFIG, memberRoleId: "role-personnel" };
    expect(tierOf(member(["role-nobody"]), gated)).toBe(Tier.None);
    expect(tierOf(member(["role-personnel"]), gated)).toBe(Tier.Member);
    // Staff still outrank the gate — a tier above it never needs it as well.
    expect(tierOf(member(["role-staff"]), gated)).toBe(Tier.Staff);
  });

  it("does not match an unconfigured tier against an empty role id", () => {
    // The bug this guards: "" is falsy but is also a perfectly valid array
    // entry. A member whose role list contained "" must not become an owner
    // because ownerRoleId happens to be unset.
    expect(tierOf(member([""]), EMPTY_CONFIG)).toBe(Tier.Member);
    expect(tierOf(member([""]), { ...EMPTY_CONFIG, memberRoleId: "x" })).toBe(
      Tier.None
    );
  });

  it("has no tier for an absent member (a DM, or a malformed payload)", () => {
    expect(tierOf(undefined, CONFIG)).toBe(Tier.None);
  });
});

describe("isGuildAdmin", () => {
  it("recognises the Administrator bit inside a larger permission set", () => {
    // 8 is ADMINISTRATOR; 2048 is SEND_MESSAGES. Together: 2056.
    expect(isGuildAdmin(member([], "2056"))).toBe(true);
  });

  it("is false for a member with many permissions but not that one", () => {
    expect(isGuildAdmin(member([], "2048"))).toBe(false);
  });

  it("survives a missing or malformed permissions field", () => {
    expect(isGuildAdmin({ roles: [] })).toBe(false);
    expect(isGuildAdmin(member([], "not-a-number"))).toBe(false);
  });

  it("is the bootstrap hatch: an admin is an owner even with nothing configured", () => {
    // Without this, a freshly invited bot would refuse /engine setup — the only
    // command that could configure it — and be permanently unusable.
    expect(tierOf(member([], ADMIN_BITS), EMPTY_CONFIG)).toBe(Tier.Owner);
  });
});

describe("hasTier", () => {
  it("lets a higher tier do a lower tier's work", () => {
    const command = member(["role-command"]);
    expect(hasTier(command, CONFIG, Tier.Staff)).toBe(true);
    expect(hasTier(command, CONFIG, Tier.Command)).toBe(true);
    expect(hasTier(command, CONFIG, Tier.Owner)).toBe(false);
  });

  it("does not let a lower tier reach up", () => {
    expect(hasTier(member(["role-staff"]), CONFIG, Tier.Command)).toBe(false);
  });
});

describe("clampDelta", () => {
  it("passes an ordinary award straight through", () => {
    expect(clampDelta(10, 5)).toBe(5);
    expect(clampDelta(10, -4)).toBe(-4);
  });

  it("stops a removal at zero rather than going negative", () => {
    // "You owe the Foundation four points" is not a state worth explaining in a
    // promotion review.
    expect(clampDelta(3, -10)).toBe(-3);
    expect(clampDelta(0, -10)).toBe(0);
  });

  it("allows a removal that lands exactly on zero", () => {
    expect(clampDelta(7, -7)).toBe(-7);
  });
});
