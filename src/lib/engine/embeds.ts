import {
  ButtonStyle,
  COLOR,
  ComponentType,
  type Embed,
  type MessageComponent,
} from "@/lib/discord/types";
import type { Rung } from "./ranks";

// Everything the bot renders. Kept apart from the logic so an embed can be
// restyled without going near the rules, and so the tests can assert on the
// rules without matching strings.

/** Discord renders <@id> as a mention; allowed_mentions stops it pinging. */
export const mention = (id: string) => `<@${id}>`;
export const roleMention = (id: string) => `<@&${id}>`;

/** Custom ids are namespaced `engine:<area>:<verb>:<id>` so the component
 *  router can dispatch on shape alone, and so a future feature adding its own
 *  buttons cannot collide with these. */
export const promoButtonId = (verb: string, requestId: string) =>
  `engine:promo:${verb}:${requestId}`;

export function parseCustomId(customId: string): {
  area: string;
  verb: string;
  id: string;
} | null {
  const parts = customId.split(":");
  if (parts.length !== 4 || parts[0] !== "engine") return null;
  return { area: parts[1], verb: parts[2], id: parts[3] };
}

export function rungLabel(rung: Rung | null): string {
  return rung ? `${rung.label} (${roleMention(rung.roleId)})` : "Unranked";
}

/** Small bold line Discord draws above the heading on every panel. */
export const EYEBROW = "THE ENGINE";

/**
 * Build a panel: eyebrow, large heading, body.
 *
 * Discord cannot size an embed's `title` — it is fixed at roughly body text —
 * but a markdown `#` heading at the top of the description renders about twice
 * as large. So every panel leaves `title` empty and puts its name in the
 * description instead, with the bot's name as the eyebrow above it.
 */
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

/** A fixed-width position marker — `01`, `02` … — so a column of them lines up. */
export const ordinal = (n: number) => `\`${String(n).padStart(2, "0")}\``;

/** Thousands-separated point total. */
export const points = (n: number) => n.toLocaleString("en-US");

export type ReviewEmbedInput = {
  requestId: string;
  discordId: string;
  username: string;
  from: Rung | null;
  to: Rung;
  points: number;
  status: "pending" | "approved" | "denied" | "cancelled";
  reviewerId?: string | null;
  reason?: string;
  /** The application form link, for a rank that requires one. */
  applicationUrl?: string;
};

export function promotionEmbed(input: ReviewEmbedInput): Embed {
  const color =
    input.status === "approved"
      ? COLOR.approved
      : input.status === "pending"
        ? COLOR.pending
        : COLOR.denied;

  const fields = [
    { name: "Personnel", value: mention(input.discordId), inline: true },
    { name: "Points", value: points(input.points), inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
    { name: "Current rank", value: rungLabel(input.from), inline: true },
    { name: "Requested rank", value: rungLabel(input.to), inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
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
  const intro = applied
    ? `**${input.username}** has applied for **${input.to.label}**.`
    : `**${input.username}** has requested advancement.`;

  return panel(heading[input.status], intro, {
    color,
    fields,
    footer: { text: `Request ${input.requestId}` },
    timestamp: new Date().toISOString(),
  });
}

/** Approve/Deny. Omitted entirely once a request is decided, so a decided
 *  request cannot be decided twice by someone scrolling back. */
export function promotionButtons(requestId: string): MessageComponent[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Success,
          label: "Approve",
          custom_id: promoButtonId("approve", requestId),
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Danger,
          label: "Deny",
          custom_id: promoButtonId("deny", requestId),
        },
      ],
    },
  ];
}

export function leaderboardEmbed(
  rows: { discordId: string; username: string; points: number }[],
  viewer?: { position: number | null; points: number }
): Embed {
  // One line per member: a fixed-width position, the mention, and the total
  // right after a thin separator. No medals — a service record reads the same
  // for first place as for fifteenth.
  const lines = rows.map(
    (row, i) => `${ordinal(i + 1)}  ${mention(row.discordId)}  ·  **${points(row.points)}**`
  );

  const header = "-# POSITION · PERSONNEL · POINTS";
  const body = lines.length
    ? `${header}\n${lines.join("\n")}`
    : "_No personnel have been awarded points yet._";

  const embed = panel("Service Record", body, {
    color: COLOR.neutral,
    footer: { text: `Top ${Math.max(rows.length, 15)} by service points` },
    timestamp: new Date().toISOString(),
  });

  // Shown only to someone who is not already in the table — repeating a
  // member's own position back at them when they are sitting at #3 is noise.
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

/** Heading on every public points-log post. */
export const POINTS_LOG_TITLE = "CI POINT | POINTS SYSTEM";

const pts = (n: number) => `\`${points(n)} point${n === 1 ? "" : "s"}\``;

/**
 * The public line posted to the points webhook when a balance changes:
 *
 *   Added `5 points` to @member. They now have `7 points`.
 *
 * with who made the change, and why, underneath in small text.
 */
export function pointsLogEmbed(input: {
  kind: "add" | "remove" | "set";
  discordId: string;
  delta: number;
  before: number;
  after: number;
  actorId: string;
  reason?: string;
}): Embed {
  const who = mention(input.discordId);
  const amount = Math.abs(input.delta);
  const line =
    input.kind === "set"
      ? `Set ${who} to ${pts(input.after)}. They had ${pts(input.before)}.`
      : input.kind === "add"
        ? `Added ${pts(amount)} to ${who}. They now have ${pts(input.after)}.`
        : `Removed ${pts(amount)} from ${who}. They now have ${pts(input.after)}.`;

  const by = `-# By ${mention(input.actorId)}${input.reason ? ` · ${input.reason}` : ""}`;

  return {
    title: POINTS_LOG_TITLE,
    description: `${line}\n${by}`,
    color: COLOR.neutral,
    timestamp: new Date().toISOString(),
  };
}
