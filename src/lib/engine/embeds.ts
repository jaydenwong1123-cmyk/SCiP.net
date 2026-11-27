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
    { name: "Points held", value: points(input.points), inline: true },
    { name: "Points required", value: points(input.to.points), inline: true },
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

// --- leaderboards -----------------------------------------------------------

/** Rows per leaderboard page. Ten keeps a page on one phone screen. */
export const LEADERBOARD_PAGE_SIZE = 10;

export type LeaderboardPage = {
  /** This page's rows, already sorted. */
  rows: { discordId: string; points: number }[];
  /** 0-based page shown. */
  page: number;
  /** Everyone with points, across all pages. */
  total: number;
  /** Who ran the command, so their standing survives page turns. */
  viewer?: { id: string; position: number | null; points: number };
};

export const pageCount = (total: number) =>
  Math.max(1, Math.ceil(total / LEADERBOARD_PAGE_SIZE));

/**
 * The table itself, shared by both bots.
 *
 * Mentions are different widths, so anything after one can never line up.
 * Each row therefore leads with two fixed-width code spans — position, then
 * points padded to the widest total on the page — and puts the name last:
 *
 *   `#01`  `1,240 pts`  @member
 *   `#02`  `  980 pts`  @member
 *
 * Page one leaves a gap under third place so the podium reads as a group.
 */
export function leaderboardBody({ rows, page, total, viewer }: LeaderboardPage): string {
  if (rows.length === 0) return "_No personnel have been awarded points yet._";

  const start = page * LEADERBOARD_PAGE_SIZE;
  const width = Math.max(...rows.map((r) => points(r.points).length));
  const rankWidth = Math.max(2, String(start + rows.length).length);

  const lines: string[] = [];
  rows.forEach((row, i) => {
    const pos = start + i + 1;
    const rank = `\`#${String(pos).padStart(rankWidth, "0")}\``;
    const pts = `\`${points(row.points).padStart(width, " ")} pts\``;
    const you = viewer?.id === row.discordId ? "  ◀ you" : "";
    lines.push(`${rank}  ${pts}  ${mention(row.discordId)}${you}`);
    if (pos === 3 && i < rows.length - 1) lines.push("");
  });

  const pages = pageCount(total);
  const summary = `-# ${total.toLocaleString("en-US")} ranked · page ${page + 1} of ${pages}`;
  return `${summary}\n\n${lines.join("\n")}`;
}

/** "Your standing" — only when the viewer is not already on this page. */
export function viewerField(input: LeaderboardPage) {
  const v = input.viewer;
  if (!v) return [];
  if (input.rows.some((r) => r.discordId === v.id)) return [];
  return [
    {
      name: "Your standing",
      value: v.position
        ? `\`#${String(v.position).padStart(2, "0")}\`  \`${points(v.points)} pts\`  ${mention(v.id)}`
        : `${mention(v.id)} has no points yet.`,
      inline: false,
    },
  ];
}

/**
 * « ‹ 1 / 6 › » under a leaderboard. `idFor(target, slot)` builds each
 * button's custom id; the slot keeps ids unique when two buttons point at the
 * same page (Discord rejects a message whose buttons share an id).
 */
export function pagerButtons(
  page: number,
  total: number,
  idFor: (target: number, slot: string) => string
): MessageComponent[] {
  const pages = pageCount(total);
  if (pages <= 1) return [];
  const last = pages - 1;
  const btn = (
    label: string,
    target: number,
    slot: string,
    disabled: boolean
  ): MessageComponent => ({
    type: ComponentType.Button,
    style: ButtonStyle.Primary,
    label,
    custom_id: idFor(target, slot),
    disabled,
  });
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        btn("«", 0, "first", page === 0),
        btn("‹", page - 1, "prev", page === 0),
        {
          type: ComponentType.Button,
          style: ButtonStyle.Secondary,
          label: `${page + 1} / ${pages}`,
          custom_id: idFor(page, "label"),
          disabled: true,
        },
        btn("›", page + 1, "next", page === last),
        btn("»", last, "last", page === last),
      ],
    },
  ];
}

/** Page number out of a pager custom id's `<page>.<slot>` part. */
export const pageOf = (part: string) => {
  const n = Number.parseInt(part, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export const leaderboardButtonId = (page: number, slot: string, viewerId: string) =>
  `engine:lb:${page}.${slot}:${viewerId}`;

export function leaderboardEmbed(input: LeaderboardPage): Embed {
  return panel("Points Leaderboard", leaderboardBody(input), {
    color: COLOR.neutral,
    fields: viewerField(input),
    footer: { text: "Ranked by points · ties go to whoever got there first" },
    timestamp: new Date().toISOString(),
  });
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
