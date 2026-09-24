import {
  ButtonStyle,
  COLOR,
  ComponentType,
  type Embed,
  type MessageComponent,
  type MessagePayload,
} from "@/lib/discord/types";
import { mention, ordinal, points, roleMention } from "@/lib/engine/embeds";
import { divisionLabel, type DivisionKey } from "./divisions";
import type { CouncilRung } from "./ranks";

// Everything The Council renders. Same visual language as The Engine's panels
// (lib/engine/embeds.ts) — large heading, small eyebrow — with the division
// named wherever a rank is.

export { mention, ordinal, points, roleMention };

export const EYEBROW = "THE COUNCIL";

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

export function leaderboardEmbed(
  division: DivisionKey,
  rows: { discordId: string; points: number }[],
  viewer?: { position: number | null; points: number }
): Embed {
  const lines = rows.map(
    (row, i) =>
      `${ordinal(i + 1)}  ${mention(row.discordId)}  ·  **${points(row.points)}**`
  );
  const header = "-# POSITION · PERSONNEL · POINTS";
  const body = lines.length
    ? `${header}\n${lines.join("\n")}`
    : "_Nobody in this division has been awarded points yet._";

  const embed = panel(`${divisionLabel(division)} Service Record`, body, {
    color: COLOR.neutral,
    footer: { text: `Top ${Math.max(rows.length, 15)} by service points` },
    timestamp: new Date().toISOString(),
  });

  if (viewer && viewer.position && viewer.position > rows.length) {
    embed.fields = [
      {
        name: "Your standing",
        value: `${ordinal(viewer.position)}  ·  **${points(viewer.points)}** points`,
        inline: false,
      },
    ];
  }
  return embed;
}

export const POINTS_LOG_TITLE = "THE COUNCIL | POINTS SYSTEM";

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
