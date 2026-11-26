import { describe, expect, it } from "vitest";
import { commandLine, commandLogMessage, keepPrivate } from "./command-log";
import type { Interaction } from "@/lib/discord/types";

const base = (data: Interaction["data"], type = 2): Interaction => ({
  id: "1",
  application_id: "2",
  type,
  token: "t",
  guild_id: "g",
  channel_id: "c1",
  member: { user: { id: "u1", username: "alice" }, roles: [] },
  data,
});

const reply = (content: string) => ({ type: 4, data: { content, flags: 64 } });

describe("command log", () => {
  it("rebuilds the command with its subcommand and options", () => {
    const i = base({
      name: "points",
      options: [
        {
          name: "add",
          type: 1,
          options: [
            { name: "user", type: 6, value: "u2" },
            { name: "amount", type: 4, value: 5 },
          ],
        },
      ],
    });
    expect(commandLine(i)).toBe("/points add user:<@u2> amount:5");
  });

  it("never repeats a webhook URL", () => {
    const i = base({
      name: "engine",
      options: [
        {
          name: "setup",
          type: 1,
          options: [
            { name: "command_log", type: 3, value: "https://discord.com/api/webhooks/1/abc" },
            { name: "points_webhook", type: 3, value: "off" },
          ],
        },
      ],
    });
    const line = commandLine(i);
    expect(line).not.toContain("discord.com");
    expect(line).toContain("command_log:[hidden]");
    expect(line).toContain("points_webhook:off");
  });

  it("posts who ran it, where, and the reply", () => {
    const msg = commandLogMessage(base({ name: "leaderboard" }), reply("Done."));
    expect(msg?.content).toBe("-# <@u1> ran `/leaderboard` in <#c1>\nDone.");
  });

  it("skips private replies, opened modals and button presses", () => {
    const i = base({ name: "points" });
    expect(commandLogMessage(i, keepPrivate(reply("No.")))).toBeNull();
    expect(commandLogMessage(i, { type: 9 })).toBeNull();
    expect(commandLogMessage(base({ custom_id: "engine:promo:approve:x" }, 3), reply("x"))).toBeNull();
  });
});
