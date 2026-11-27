import {
  ButtonStyle,
  COLOR,
  ComponentType,
  type Embed,
  type MessageComponent,
  type MessagePayload,
} from "@/lib/discord/types";
import type { CouncilShift } from "@prisma/client";
import {
  leaderboardBody,
  mention,
  ordinal,
  pagerButtons,
  pageCount,
  points,
  roleMention,
  viewerField,
  LEADERBOARD_PAGE_SIZE,
  type LeaderboardPage,
} from "@/lib/engine/embeds";
import { divisionLabel, type DivisionKey } from "./divisions";
import type { CouncilRung } from "./ranks";
import { DOUBLE_POINTS, formatDuration, shiftMultiplier } from "./shift-points";
import type { ShiftTotals } from "./shifts";

// Everything The Crimson Hand renders. Same visual language as The Engine's panels
// (lib/engine/embeds.ts) — large heading, small eyebrow — with the division
// named wherever a rank is.

export { mention, ordinal, pagerButtons, pageCount, points, roleMention, LEADERBOARD_PAGE_SIZE };

export const EYEBROW = "THE CRIMSON HAND";

export function panel(
  heading: string,
  body?: string,
  rest: Omit<Embed, "title" | "description" | "author"> = {}
): Embed {
  return {
    author: { name: EYEBROW },
    description: body ? `# ${heading}\n${body}` : `# ${heading}`,
    ...rest,
  };
}

/** Custom ids are `council:<area>:<verb>:<id>`, so they can never be mistaken
 *  for The Engine's `engine:` ones. */
export const customId = (area: string, verb: string, id: string) =>
  `council:${area}:${verb}:${id}`;

export function parseCustomId(
  value: string
): { area: string; verb: string; id: string } | null {
  const parts = value.split(":");
  if (parts.length !== 4 || parts[0] !== "council") return null;
  return { area: parts[1], verb: parts[2], id: parts[3] };
}

export function rungLabel(rung: CouncilRung | null): string {
  if (!rung) return "Unranked";
  const band = rung.band ? ` · ${rung.band}` : "";
  return `${rung.label} (${roleMention(rung.roleId)})${band}`;
}

export type ReviewEmbedInput = {
  requestId: string;
  discordId: string;
  username: string;
  division: DivisionKey;
  toDivision: DivisionKey;
  from: CouncilRung | null;
  to: CouncilRung;
  points: number;
  status: "pending" | "approved" | "denied" | "cancelled";
  reviewerId?: string | null;
  reason?: string;
  applicationUrl?: string;
};

export function promotionEmbed(input: ReviewEmbedInput): Embed {
  const color =
    input.status === "approved"
      ? COLOR.approved
      : input.status === "pending"
        ? COLOR.pending
        : COLOR.denied;

  const feedIn = input.division !== input.toDivision;
  const divisionLine = feedIn
    ? `${divisionLabel(input.division)} → **${divisionLabel(input.toDivision)}**`
    : divisionLabel(input.division);

  const fields = [
    { name: "Personnel", value: mention(input.discordId), inline: true },
    { name: "Division", value: divisionLine, inline: true },
    { name: "​", value: "​", inline: true },
    { name: "Points held", value: points(input.points), inline: true },
    { name: "Points required", value: points(input.to.points), inline: true },
    { name: "​", value: "​", inline: true },
    { name: "Current rank", value: rungLabel(input.from), inline: true },
    { name: "Requested rank", value: rungLabel(input.to), inline: true },
    { name: "​", value: "​", inline: true },
  ];

  if (input.applicationUrl) {
    fields.push({
      name: "Application",
      value: `Submitted via the [application form](${input.applicationUrl}). Check its responses for ${mention(input.discordId)} before deciding.`,
      inline: false,
    });
  }
  if (input.status !== "pending" && input.reviewerId) {
    fields.push({
      name: input.status === "approved" ? "Approved by" : "Denied by",
      value: mention(input.reviewerId),
      inline: false,
    });
  }
  if (input.reason) {
    fields.push({ name: "Reason", value: input.reason, inline: false });
  }

  const applied = !!input.applicationUrl;
  const noun = applied ? "Application" : "Promotion";
  const heading: Record<ReviewEmbedInput["status"], string> = {
    pending: applied ? "Rank Application" : "Promotion Request",
    approved: `${noun} Approved`,
    denied: `${noun} Denied`,
    cancelled: `${noun} Withdrawn`,
  };
  const intro = feedIn
    ? `**${input.username}** has reached the top of ${divisionLabel(input.division)} and asks to advance into **${divisionLabel(input.toDivision)}**.`
    : applied
      ? `**${input.username}** has applied for **${input.to.label}**.`
      : `**${input.username}** has requested advancement.`;

  return panel(heading[input.status], intro, {
    color,
    fields,
    footer: { text: `Request ${input.requestId}` },
    timestamp: new Date().toISOString(),
  });
}

export function promotionButtons(requestId: string): MessageComponent[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Success,
          label: "Approve",
          custom_id: customId("promo", "approve", requestId),
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Danger,
          label: "Deny",
          custom_id: customId("promo", "deny", requestId),
        },
      ],
    },
  ];
}

/** The reply to /promote request for a rank that needs an application. */
export function applicationPrompt(rung: CouncilRung): MessagePayload {
  return {
    embeds: [
      panel(
        "Application Required",
        `**${rung.label}** needs an application as well as points. You have the points.\n\n` +
          "1. Open the form below and fill it in.\n" +
          "2. Come back here and press **I've submitted it**.\n\n" +
          "-# Your request only reaches your division's HR after step 2.",
        { color: COLOR.pending }
      ),
    ],
    components: [
      {
        type: ComponentType.ActionRow,
        components: [
          {
            type: ComponentType.Button,
            style: ButtonStyle.Link,
            label: "Open application form",
            url: rung.applicationUrl,
          },
          {
            type: ComponentType.Button,
            style: ButtonStyle.Success,
            label: "I've submitted it",
            custom_id: customId("apply", "done", rung.roleId),
          },
        ],
      },
    ],
  };
}

/** `council:lb:<division>.<page>.<slot>:<viewerId>` — one dot-joined part, so
 *  the id still splits into the four parts parseCustomId expects. */
export const leaderboardButtonId = (
  division: DivisionKey,
  page: number,
  slot: string,
  viewerId: string
) => customId("lb", `${division}.${page}.${slot}`, viewerId);

export function leaderboardEmbed(division: DivisionKey, input: LeaderboardPage): Embed {
  const body =
    input.rows.length === 0
      ? "_Nobody in this division has been awarded points yet._"
      : leaderboardBody(input);
  return panel(`${divisionLabel(division)} Leaderboard`, body, {
    color: COLOR.neutral,
    fields: viewerField(input),
    footer: { text: `Division: ${divisionLabel(division)} · ranked by service points` },
    timestamp: new Date().toISOString(),
  });
}

export const POINTS_LOG_TITLE = "THE CRIMSON HAND | POINTS SYSTEM";

const pts = (n: number) => `\`${points(n)} point${n === 1 ? "" : "s"}\``;

export function pointsLogEmbed(input: {
  kind: "add" | "remove" | "set";
  division: DivisionKey;
  discordId: string;
  delta: number;
  before: number;
  after: number;
  actorId: string;
  reason?: string;
}): Embed {
  const who = mention(input.discordId);
  const where = `in **${divisionLabel(input.division)}**`;
  const amount = Math.abs(input.delta);
  const line =
    input.kind === "set"
      ? `Set ${who} to ${pts(input.after)} ${where}. They had ${pts(input.before)}.`
      : input.kind === "add"
        ? `Added ${pts(amount)} to ${who} ${where}. They now have ${pts(input.after)}.`
        : `Removed ${pts(amount)} from ${who} ${where}. They now have ${pts(input.after)}.`;

  const by = `-# By ${mention(input.actorId)}${input.reason ? ` · ${input.reason}` : ""}`;
  return {
    title: POINTS_LOG_TITLE,
    description: `${line}\n${by}`,
    color: COLOR.neutral,
    timestamp: new Date().toISOString(),
  };
}

// --- shifts -----------------------------------------------------------------

const unix = (date: Date) => Math.floor(date.getTime() / 1000);

/** The banner the shift panels carry while double points are on, else null. */
export function doublePointsLine(until: Date | null, now = new Date()): string | null {
  if (!until || shiftMultiplier(until, now) === 1) return null;
  return `**${DOUBLE_POINTS}× points** on every shift that ends before <t:${unix(until)}:t> (<t:${unix(until)}:R>).`;
}

/** Posted in the open by /shift double start. */
export function doublePointsEmbed(until: Date, actorId: string, replaced: Date | null): Embed {
  const was = replaced
    ? `\n-# Replaces the window that was due to end <t:${unix(replaced)}:R>.`
    : "";
  return panel(
    "Double Points",
    `Every shift that **ends** before <t:${unix(until)}:f> (<t:${unix(until)}:R>) pays **${DOUBLE_POINTS}×** the usual points. End your shift before then to get them.${was}\n-# Started by ${mention(actorId)}`,
    { color: COLOR.approved, timestamp: new Date().toISOString() }
  );
}

export type ShiftPanelInput = {
  discordId: string;
  active: CouncilShift | null;
  /** Time on the live shift, in seconds. */
  seconds: number;
  totals: ShiftTotals;
  /** The member's division, for the shift type when they are off shift. */
  division: DivisionKey | null;
  /** CouncilConfig.doublePointsUntil. */
  doublePointsUntil: Date | null;
};

/** The /shift manage and /shift admin panel: the live shift, then the record. */
export function shiftEmbed(input: ShiftPanelInput): Embed {
  const { active, totals } = input;
  const fields: NonNullable<Embed["fields"]> = [];

  const double = doublePointsLine(input.doublePointsUntil);
  if (double) fields.push({ name: "Double Points", value: double, inline: false });

  if (active) {
    const status = active.pausedAt
      ? `On Break (since <t:${unix(active.pausedAt)}:R>)`
      : "On Shift";
    fields.push({
      name: "Current Shift",
      value:
        `**Status**: ${status}\n` +
        `**Started**: <t:${unix(active.startedAt)}:R>\n` +
        `**Time on shift**: ${formatDuration(input.seconds)}` +
        (active.adjustSeconds !== 0 ? "\n-# Includes a correction by HR." : ""),
      inline: false,
    });
  }

  fields.push({
    name: "All Time Information",
    value:
      `**Shift Count**: ${totals.count}\n` +
      `**Total Duration**: ${formatDuration(totals.totalSeconds)}\n` +
      `**Average Duration**: ${formatDuration(totals.averageSeconds)}\n` +
      `**Points Earned**: ${points(totals.points)}`,
    inline: false,
  });

  const heading = !active ? "Shift Panel" : active.pausedAt ? "On Break" : "Shift Started";
  const color = !active ? COLOR.neutral : active.pausedAt ? COLOR.pending : COLOR.approved;
  const type = active?.division ?? input.division;
  return panel(heading, mention(input.discordId), {
    color,
    fields,
    footer: { text: `Shift Type: ${divisionLabel(type)}` },
  });
}

const button = (
  style: number,
  label: string,
  custom_id: string,
  disabled = false
): MessageComponent => ({ type: ComponentType.Button, style, label, custom_id, disabled });

/** Start / Pause (or Resume) / End, for the member's own panel. */
export function shiftButtons(discordId: string, active: CouncilShift | null): MessageComponent[] {
  const on = !!active;
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        button(ButtonStyle.Success, "Start", customId("shift", "start", discordId), on),
        button(
          ButtonStyle.Primary,
          active?.pausedAt ? "Resume" : "Pause",
          customId("shift", "pause", discordId),
          !on
        ),
        button(ButtonStyle.Danger, "End", customId("shift", "end", discordId), !on),
      ],
    },
  ];
}

/** HR's controls over someone else's shift. */
export function shiftAdminButtons(discordId: string, active: CouncilShift | null): MessageComponent[] {
  const on = !!active;
  const id = (verb: string) => customId("shiftadm", verb, discordId);
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        button(ButtonStyle.Success, "Start", id("start"), on),
        button(ButtonStyle.Danger, "End", id("end"), !on),
        button(ButtonStyle.Secondary, "Add time", id("add"), !on),
        button(ButtonStyle.Secondary, "Set time", id("set"), !on),
        button(ButtonStyle.Danger, "Delete", id("delete"), !on),
      ],
    },
  ];
}

/** The second press a delete needs. */
export function shiftDeleteConfirm(discordId: string): MessageComponent[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        button(ButtonStyle.Danger, "Delete shift", customId("shiftadm", "deleteyes", discordId)),
        button(ButtonStyle.Secondary, "Cancel", customId("shiftadm", "panel", discordId)),
      ],
    },
  ];
}

export type ActiveShiftRow = {
  discordId: string;
  division: string;
  seconds: number;
  paused: boolean;
};

/** Longest /shift active list; one embed holds about this many lines. */
export const ACTIVE_SHIFTS_SHOWN = 40;

export function activeShiftsEmbed(rows: ActiveShiftRow[], doublePointsUntil: Date | null): Embed {
  const lines = rows
    .slice(0, ACTIVE_SHIFTS_SHOWN)
    .map(
      (row) =>
        `${mention(row.discordId)}  ·  ${divisionLabel(row.division)}  ·  **${formatDuration(row.seconds)}**${row.paused ? "  ·  _on break_" : ""}`
    );
  const more = rows.length - lines.length;
  const header = "-# PERSONNEL · SHIFT TYPE · TIME ON SHIFT";
  const body = lines.length
    ? `${header}\n${lines.join("\n")}${more > 0 ? `\n-# …and ${more} more.` : ""}`
    : "_Nobody is on shift._";
  const double = doublePointsLine(doublePointsUntil);
  return panel("On Shift", double ? `${double}\n\n${body}` : body, {
    color: rows.length ? COLOR.approved : COLOR.neutral,
    footer: { text: `${rows.length} on shift` },
    timestamp: new Date().toISOString(),
  });
}
