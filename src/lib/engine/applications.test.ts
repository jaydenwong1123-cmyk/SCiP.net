import { describe, it, expect } from "vitest";
import {
  DEFAULT_QUESTIONS,
  MAX_LABEL,
  collectAnswers,
  decodeAnswers,
  encodeAnswers,
  parseQuestions,
  questionsFor,
} from "./applications";
import { isWebhookUrl } from "./config";
import { pointsLogEmbed } from "./embeds";
import type { Rung } from "./ranks";

const rung = (applicationQuestions = ""): Rung => ({
  id: "id",
  roleId: "r1",
  label: "Site Director",
  points: 500,
  requiresApplication: true,
  applicationQuestions,
});

describe("parseQuestions", () => {
  it("splits on | and drops blanks", () => {
    expect(parseQuestions(" Why? | | What have you done? ")).toEqual([
      "Why?",
      "What have you done?",
    ]);
  });

  it("keeps at most five, each short enough for a modal label", () => {
    const parsed = parseQuestions(
      ["a", "b", "c", "d", "e", "f", "x".repeat(80)].join("|")
    );
    expect(parsed).toEqual(["a", "b", "c", "d", "e"]);
    expect(parseQuestions("x".repeat(80))[0].length).toBe(MAX_LABEL);
  });

  it("reads back the newline-separated stored form", () => {
    expect(parseQuestions("One\nTwo")).toEqual(["One", "Two"]);
  });
});

describe("questionsFor", () => {
  it("falls back to the defaults when none are set", () => {
    expect(questionsFor(rung())).toEqual(DEFAULT_QUESTIONS);
    expect(questionsFor(rung("Only this"))).toEqual(["Only this"]);
  });
});

describe("answers", () => {
  it("pairs each question with its field and round-trips", () => {
    const answers = collectAnswers(rung("A|B"), (name) =>
      name === "q0" ? " yes " : "no"
    );
    expect(answers).toEqual([
      { q: "A", a: "yes" },
      { q: "B", a: "no" },
    ]);
    expect(decodeAnswers(encodeAnswers(answers))).toEqual(answers);
  });

  it("decodes an empty or corrupt column to no answers", () => {
    expect(decodeAnswers("")).toEqual([]);
    expect(decodeAnswers("{not json")).toEqual([]);
    expect(encodeAnswers([])).toBe("");
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
    expect(embed.title).toBe("SSF POINTS | POINTS SYSTEM");
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
