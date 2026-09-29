import { afterEach, describe, it, expect, vi } from "vitest";
import { securityGate, type SecurityConfig, type SecurityProfile } from "./guard";
import { discordRest } from "./rest";
import type { Interaction } from "./types";
import { panel } from "@/lib/engine/embeds";

// The gate every interaction passes before its handler runs.
//
// What it must never do is let a change through during a lockdown, or answer a
// server that is not the bot's own. What it must also never do is freeze the
// people who have to fix things, or block look-ups, or the lockdown becomes a
// reason not to use it.

const PROFILE: SecurityProfile = {
  bot: "engine",
  name: "The Engine",
  guildEnv: "TEST_GUARD_GUILD_ID",
  setupCommand: "/engine setup",
  engageLabel: "High Command",
  throttles: ["points"],
  rest: discordRest("TEST_GUARD_TOKEN", "The Engine"),
  panel,
  saveLock: async () => undefined,
};

const OPEN: SecurityConfig = {
  guildId: "home",
  securityChannelId: "",
  lockedAt: null,
  lockedById: "",
  lockReason: "",
};

const LOCKED: SecurityConfig = {
  ...OPEN,
  lockedAt: new Date("2026-09-24T12:00:00Z"),
  lockedById: "u9",
  lockReason: "testing",
};

const interaction = (
  over: { guild?: string; admin?: boolean; appPermissions?: string } = {}
): Interaction => ({
  id: "i1",
  application_id: "app1",
  type: 2,
  token: "t",
  guild_id: over.guild ?? "home",
  app_permissions: over.appPermissions ?? "268454912",
  member: {
    user: { id: "u1", username: "agent" },
    roles: [],
    permissions: over.admin ? "8" : "0",
  },
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("securityGate", () => {
  it("lets everything through in the bot's own server, unlocked", () => {
    expect(securityGate(PROFILE, interaction(), OPEN, "write")).toBeNull();
    expect(securityGate(PROFILE, interaction(), OPEN, "read")).toBeNull();
  });

  it("answers nothing from another server, even for its administrators", () => {
    const foreign = interaction({ guild: "elsewhere", admin: true });
    expect(securityGate(PROFILE, foreign, OPEN, "read")).toMatch(/only works in its own server/);
  });

  it("pins to the environment's server over the one saved in settings", () => {
    vi.stubEnv("TEST_GUARD_GUILD_ID", "pinned");
    expect(securityGate(PROFILE, interaction(), OPEN, "read")).not.toBeNull();
    expect(securityGate(PROFILE, interaction({ guild: "pinned" }), OPEN, "read")).toBeNull();
  });

  it("answers any server before its setup has been run", () => {
    const fresh = { ...OPEN, guildId: "" };
    expect(securityGate(PROFILE, interaction({ guild: "anywhere" }), fresh, "write")).toBeNull();
  });

  it("refuses to run at all while the bot has Administrator", () => {
    const risky = interaction({ appPermissions: "8", admin: true });
    expect(securityGate(PROFILE, risky, OPEN, "read")).toMatch(/switched off/);
  });

  it("freezes changes during a lockdown but not look-ups", () => {
    expect(securityGate(PROFILE, interaction(), LOCKED, "write")).toMatch(/lockdown/);
    expect(securityGate(PROFILE, interaction(), LOCKED, "read")).toBeNull();
  });

  it("does not freeze server administrators, who have to repair things", () => {
    expect(securityGate(PROFILE, interaction({ admin: true }), LOCKED, "write")).toBeNull();
  });
});
