import { describe, it, expect } from "vitest";
import { applicationPrompt, applyDoneId, isFormUrl } from "./applications";
import { isWebhookUrl } from "./config";
import { pointsLogEmbed } from "./embeds";
import type { Rung } from "./ranks";

const FORM = "https://docs.google.com/forms/d/e/abc/viewform";

const rung: Rung = {
  id: "id",
  roleId: "r1",
  label: "Site Director",
  points: 500,
  requiresApplication: true,
  applicationUrl: FORM,
};

describe("isFormUrl", () => {
  it("accepts https links and refuses anything else", () => {
    expect(isFormUrl(FORM)).toBe(true);
    expect(isFormUrl("https://forms.gle/abc123")).toBe(true);
    expect(isFormUrl("http://forms.gle/abc123")).toBe(false);
    expect(isFormUrl("forms.gle/abc123")).toBe(false);
    expect(isFormUrl("true")).toBe(false);
  });
});

describe("applicationPrompt", () => {
  it("links the form and offers the submitted button for that rank", () => {
    const buttons = applicationPrompt(rung).components?.[0].components ?? [];
    expect(buttons[0].url).toBe(FORM);
    expect(buttons[0].custom_id).toBeUndefined();
    expect(buttons[1].custom_id).toBe(applyDoneId("r1"));
  });
});

describe("isWebhookUrl", () => {
  it("accepts Discord webhook URLs only", () => {
    expect(
      isWebhookUrl("https://discord.com/api/webhooks/123456/abc-DEF_789")
    ).toBe(true);
    expect(
      isWebhookUrl("https://ptb.discordapp.com/api/webhooks/1/x")
    ).toBe(true);
    expect(isWebhookUrl("https://discord.com/channels/1/2")).toBe(false);
    expect(isWebhookUrl("https://evil.example/api/webhooks/1/x")).toBe(false);
  });
});

describe("pointsLogEmbed", () => {
  it("reads like the points log line", () => {
    const embed = pointsLogEmbed({
      kind: "add",
      discordId: "42",
      delta: 5,
      before: 2,
      after: 7,
      actorId: "9",
    });
    expect(embed.title).toBe("CI POINT | POINTS SYSTEM");
    expect(embed.description).toContain(
      "Added `5 points` to <@42>. They now have `7 points`."
    );
  });

  it("singularises one point and names removals", () => {
    const embed = pointsLogEmbed({
      kind: "remove",
      discordId: "42",
      delta: -1,
      before: 2,
      after: 1,
      actorId: "9",
      reason: "late",
    });
    expect(embed.description).toContain(
      "Removed `1 point` from <@42>. They now have `1 point`."
    );
    expect(embed.description).toContain("late");
  });
});
