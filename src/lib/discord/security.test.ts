import { describe, it, expect } from "vitest";
import {
  auditRoles,
  botPermissionProblem,
  dangerousPermissions,
  isFreshTimestamp,
  listOf,
  overLimit,
  roleGrantProblem,
} from "./security";
import type { GuildRole } from "./types";

// The anti-nuke rules.
//
// These decide whether either bot can be used to hand someone the keys to the
// server, so the failure that matters is a dangerous role slipping through. The
// tests pin that, and pin the opposite too: the setup guide's own invite link
// must not trip the bot's refusal to run, or every correct install breaks.

const bits = (...n: number[]) =>
  n.reduce((acc, b) => acc | (BigInt(1) << BigInt(b)), BigInt(0)).toString();

/** What the setup guide's invite link grants: Manage Roles, View Channels,
 *  Send Messages, Embed Links. */
const INVITE_PERMISSIONS = "268454912";

const role = (over: Partial<GuildRole> = {}): GuildRole => ({
  id: "r1",
  name: "Researcher",
  permissions: bits(10, 11), // View Channels, Send Messages
  position: 1,
  managed: false,
  ...over,
});

describe("dangerousPermissions", () => {
  it("finds nothing in an ordinary member's permissions", () => {
    expect(dangerousPermissions(bits(10, 11, 14, 16))).toEqual([]);
    expect(dangerousPermissions("0")).toEqual([]);
  });

  it("names each dangerous permission it finds", () => {
    expect(dangerousPermissions(bits(1, 2))).toEqual(["Ban Members", "Kick Members"]);
    expect(dangerousPermissions(bits(28))).toEqual(["Manage Roles"]);
  });

  it("reads permissions above bit 31, which plain numbers would lose", () => {
    expect(dangerousPermissions(bits(40))).toEqual(["Timeout Members"]);
    expect(dangerousPermissions(bits(34))).toEqual(["Manage Threads and Posts"]);
  });

  it("names Administrator alone, since it implies the rest", () => {
    expect(dangerousPermissions(bits(3, 2, 4))).toEqual(["Administrator"]);
  });

  it("reads nothing into missing or malformed input", () => {
    expect(dangerousPermissions(undefined)).toEqual([]);
    expect(dangerousPermissions("")).toEqual([]);
    expect(dangerousPermissions("-8")).toEqual([]);
    expect(dangerousPermissions("admin")).toEqual([]);
  });
});

describe("roleGrantProblem", () => {
  it("lets an ordinary rank role through", () => {
    expect(roleGrantProblem(role(), "g1")).toBeNull();
  });

  it("refuses a role with Administrator", () => {
    expect(roleGrantProblem(role({ permissions: bits(3) }), "g1")).toMatch(/Administrator/);
  });

  it("refuses every dangerous permission, not only Administrator", () => {
    for (const b of [1, 2, 4, 5, 13, 17, 28, 29, 30, 34, 40]) {
      expect(roleGrantProblem(role({ permissions: bits(b) }), "g1")).not.toBeNull();
    }
  });

  it("refuses @everyone and roles owned by a bot or integration", () => {
    expect(roleGrantProblem(role({ id: "g1" }), "g1")).not.toBeNull();
    expect(roleGrantProblem(role({ managed: true }), "g1")).not.toBeNull();
  });

  it("fails closed when the permissions cannot be read", () => {
    expect(roleGrantProblem(role({ permissions: undefined }), "g1")).not.toBeNull();
    expect(roleGrantProblem(role({ permissions: "lots" }), "g1")).not.toBeNull();
  });
});

describe("botPermissionProblem", () => {
  it("accepts exactly what the setup guide's invite link grants", () => {
    expect(botPermissionProblem(INVITE_PERMISSIONS, "The Engine")).toBeNull();
  });

  it("refuses to run with Administrator, naming the fix", () => {
    const problem = botPermissionProblem(bits(3), "The Engine");
    expect(problem).toMatch(/Administrator/);
    expect(problem).toMatch(/Server Settings → Roles → The Engine/);
  });

  it("names the extra permissions but never Manage Roles, which it needs", () => {
    const problem = botPermissionProblem(bits(28, 13, 2), "The Crimson Hand");
    expect(problem).toMatch(/its role has Ban Members and Manage Messages\./);
  });

  it("does not refuse when Discord sent no permissions", () => {
    expect(botPermissionProblem(undefined, "The Engine")).toBeNull();
  });
});

describe("auditRoles", () => {
  const roles: GuildRole[] = [
    { id: "g1", name: "@everyone", permissions: bits(10, 11), position: 0 },
    role({ id: "rank", position: 1 }),
    role({ id: "mod", name: "Moderator", permissions: bits(1, 13), position: 2 }),
    role({ id: "booster", managed: true, permissions: bits(3), position: 2 }),
    { id: "bot", name: "The Engine", permissions: bits(28), position: 3, managed: true, tags: { bot_id: "app1" } },
    role({ id: "admin", name: "Admin", permissions: bits(3), position: 4 }),
  ];

  it("finds the bot's role and the dangerous roles beneath it", () => {
    const audit = auditRoles(roles, "g1", "app1");
    expect(audit.botRole?.id).toBe("bot");
    expect(audit.exposed.map((e) => e.role.id)).toEqual(["mod"]);
    expect(audit.exposed[0].permissions).toEqual(["Kick Members", "Manage Messages"]);
    expect(audit.everyone).toEqual([]);
  });

  it("ignores roles above the bot, which it cannot hand out", () => {
    const audit = auditRoles(roles, "g1", "app1");
    expect(audit.exposed.map((e) => e.role.id)).not.toContain("admin");
  });

  it("flags dangerous permissions on @everyone", () => {
    const open = roles.map((r) => (r.id === "g1" ? { ...r, permissions: bits(17) } : r));
    expect(auditRoles(open, "g1", "app1").everyone).toEqual([
      "Mention @everyone, @here and All Roles",
    ]);
  });

  it("reports no bot role, rather than guessing, when it is missing", () => {
    const audit = auditRoles(roles, "g1", "someone-else");
    expect(audit.botRole).toBeNull();
    expect(audit.exposed).toEqual([]);
  });
});

describe("isFreshTimestamp", () => {
  const now = 1_790_000_000 * 1000;
  const at = (offset: number) => String(1_790_000_000 + offset);

  it("accepts a request signed within five minutes either way", () => {
    expect(isFreshTimestamp(at(0), now)).toBe(true);
    expect(isFreshTimestamp(at(-299), now)).toBe(true);
    expect(isFreshTimestamp(at(299), now)).toBe(true);
  });

  it("rejects a replay of an old request, and one dated in the future", () => {
    expect(isFreshTimestamp(at(-301), now)).toBe(false);
    expect(isFreshTimestamp(at(301), now)).toBe(false);
  });

  it("rejects a missing or malformed timestamp", () => {
    expect(isFreshTimestamp(null, now)).toBe(false);
    expect(isFreshTimestamp("", now)).toBe(false);
    expect(isFreshTimestamp("soon", now)).toBe(false);
  });
});

describe("overLimit", () => {
  it("allows up to the limit and trips on the one after", () => {
    expect(overLimit("roles", 10)).toBe(false);
    expect(overLimit("roles", 11)).toBe(true);
    expect(overLimit("announce", 5)).toBe(false);
    expect(overLimit("announce", 6)).toBe(true);
  });
});

describe("listOf", () => {
  it("joins names the way a sentence would", () => {
    expect(listOf([])).toBe("");
    expect(listOf(["A"])).toBe("A");
    expect(listOf(["A", "B"])).toBe("A and B");
    expect(listOf(["A", "B", "C"])).toBe("A, B and C");
  });
});
