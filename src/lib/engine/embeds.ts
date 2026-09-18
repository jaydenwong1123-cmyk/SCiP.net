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
    { name: "Points", value: `${input.points}`, inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
    { name: "Current rank", value: rungLabel(input.from), inline: true },
    { name: "Requested rank", value: rungLabel(input.to), inline: true },
    { name: "\u200b", value: "\u200b", inline: true },
  ];

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

  const heading: Record<ReviewEmbedInput["status"], string> = {
    pending: "PROMOTION REQUEST — AWAITING REVIEW",
    approved: "PROMOTION REQUEST — APPROVED",
    denied: "PROMOTION REQUEST — DENIED",
    cancelled: "PROMOTION REQUEST — WITHDRAWN",
  };

  return {
    title: heading[input.status],
    description: `**${input.username}** has requested advancement.`,
    color,
    fields,
    footer: { text: `Request ${input.requestId}` },
    timestamp: new Date().toISOString(),
  };
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

export const MEDALS = ["🥇", "🥈", "🥉"];

export function leaderboardEmbed(
  rows: { discordId: string; username: string; points: number }[],
  viewer?: { position: number | null; points: number }
): Embed {
  const lines = rows.map((row, i) => {
    const place = MEDALS[i] ?? `\`${String(i + 1).padStart(2, " ")}.\``;
    return `${place} ${mention(row.discordId)} — **${row.points}**`;
  });

  const description = lines.length
    ? lines.join("\n")
    : "_No personnel have been awarded points yet._";

  const embed: Embed = {
    title: "SERVICE RECORD — TOP 15",
    description,
    color: COLOR.info,
    footer: { text: "The Engine" },
  };

  // Shown only to someone who is not already in the table — repeating a
  // member's own position back at them when they are sitting at #3 is noise.
  if (viewer && viewer.position && viewer.position > rows.length) {
    embed.fields = [
      {
        name: "Your standing",
        value: `#${viewer.position} — **${viewer.points}** points`,
        inline: false,
      },
    ];
  }

  return embed;
}
