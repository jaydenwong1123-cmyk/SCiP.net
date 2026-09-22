import {
  COLOR,
  ComponentType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  actorOf,
  displayNameOf,
  type Embed,
  type Interaction,
  type InteractionOption,
  type MessageComponent,
  type MessagePayload,
} from "@/lib/discord/types";
import { createMessage } from "@/lib/discord/rest";
import { db } from "@/lib/db";
import { getEngineConfig, saveEngineConfig, type EngineConfig } from "./config";
import {
  leaderboardEmbed,
  mention,
  ordinal,
  panel,
  parseCustomId,
  points as fmtPoints,
  promotionEmbed,
  roleMention,
  rungLabel,
} from "./embeds";
import {
  Tier,
  hasTier,
  refusalFor,
  tierOf,
  type TierValue,
} from "./permissions";
import {
  adjustPoints,
  getMember,
  leaderboard,
  pointHistory,
  rankPosition,
  setPoints,
} from "./points";
import { getLadder, positionOf, removeRung, upsertRung } from "./ranks";
import {
  approveRequest,
  createRequest,
  denyRequest,
  pendingRequests,
  refreshRequestMessage,
} from "./promotions";

// THE DISPATCHER.
//
// One function in, one JSON response out. Everything here is synchronous with
// the interaction: Discord gives an endpoint three seconds to answer, and every
// path below is one or two indexed queries plus at most one REST call, which
// fits inside that with room to spare. If that ever stops being true the fix is
// a deferred response (type 5) plus a webhook edit — not background work, which
// a serverless invocation cannot promise to finish.

export type InteractionResponse = { type: number; data?: unknown };

function reply(
  payload: MessagePayload,
  { ephemeral = true }: { ephemeral?: boolean } = {}
): InteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: {
      ...payload,
      flags: ephemeral ? MessageFlags.Ephemeral : undefined,
    },
  };
}

const text = (content: string, ephemeral = true) =>
  reply({ content }, { ephemeral });

/** Refusals are always ephemeral: a public "you are not allowed" is a telling-off
 *  in front of the whole server, which is not the bot's job. */
const refuse = (required: TierValue, action?: string) =>
  text(refusalFor(required, action));

// --- option plumbing --------------------------------------------------------

type Opts = Map<string, string | number | boolean>;

/**
 * Flatten a command payload down to "which subcommand, and what did it carry".
 *
 * Discord nests a subcommand group's options two levels deep, so this walks
 * down to the leaf and returns its path joined with a space — "rank add" — which
 * is what the switch statements below match on.
 */
function route(options: InteractionOption[] | undefined): {
  path: string;
  opts: Opts;
} {
  const parts: string[] = [];
  let level = options ?? [];

  for (;;) {
    const node = level.find(
      (o) => o.type === 1 || o.type === 2 // SubCommand | SubCommandGroup
    );
    if (!node) break;
    parts.push(node.name);
    level = node.options ?? [];
  }

  const opts: Opts = new Map();
  for (const opt of level) {
    if (opt.value !== undefined) opts.set(opt.name, opt.value);
  }
  return { path: parts.join(" "), opts };
}

const str = (opts: Opts, name: string, fallback = "") =>
  typeof opts.get(name) === "string" ? (opts.get(name) as string) : fallback;

const int = (opts: Opts, name: string, fallback = 0) =>
  typeof opts.get(name) === "number" ? (opts.get(name) as number) : fallback;

/** A user/role/channel option arrives as a snowflake string. */
const id = (opts: Opts, name: string): string => str(opts, name);

/** The chosen user's display name, from the interaction's resolved payload, so
 *  the leaderboard cache stays fresh without an extra REST call. */
function resolvedName(interaction: Interaction, userId: string): string {
  const user = interaction.data?.resolved?.users?.[userId];
  const member = interaction.data?.resolved?.members?.[userId];
  return displayNameOf(member ? { ...member, roles: [] } : undefined, user);
}

// --- /points ----------------------------------------------------------------

async function handlePoints(
  interaction: Interaction,
  guildId: string,
  config: EngineConfig,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  const actor = actorOf(interaction);

  if (path === "check") {
    const target = id(opts, "user") || actor.id;
    const self = target === actor.id;
    const member = await getMember(guildId, target);
    const points = member?.points ?? 0;
    const ladder = await getLadder(guildId);
    const where = positionOf(ladder, points, member?.rankRoleId ?? null);
    const position = await rankPosition(guildId, target);

    const fields = [
      { name: "Points", value: `**${fmtPoints(points)}**`, inline: true },
      {
        name: "Standing",
        value: position ? ordinal(position) : "Unranked",
        inline: true,
      },
      { name: "Rank", value: rungLabel(where.current), inline: false },
    ];

    if (where.next) {
      fields.push({
        name: "Next rank",
        value: where.eligible
          ? `**${where.next.label}** — eligible now. Run \`/promote request\`.`
          : `**${where.next.label}** — ${where.shortfall} more point${where.shortfall === 1 ? "" : "s"} needed.`,
        inline: false,
      });
    } else if (where.current) {
      fields.push({
        name: "Next rank",
        value: "At the top of the ladder.",
        inline: false,
      });
    }

    return reply({
      embeds: [
        panel(self ? "Your Service Record" : "Service Record", mention(target), {
          color: COLOR.neutral,
          fields,
        }),
      ],
    });
  }

  // Everything else under /points is a staff action.
  if (!hasTier(interaction.member, config, Tier.Staff)) return refuse(Tier.Staff);

  const target = id(opts, "user");
  if (!target) return text("No member was given.");

  const username = resolvedName(interaction, target);
  const reason = str(opts, "reason");
  const amount = int(opts, "amount");

  if (path === "history") {
    const entries = await pointHistory(guildId, target, int(opts, "limit", 10));
    if (entries.length === 0) {
      return text(`No point changes on record for ${mention(target)}.`);
    }
    const lines = entries.map((e) => {
      const sign = e.delta > 0 ? `+${e.delta}` : `${e.delta}`;
      const when = `<t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`;
      const why = e.reason ? `\n-# ${e.reason}` : "";
      return `\`${sign.padStart(5, " ")}\`  ·  **${fmtPoints(e.balance)}**  ·  ${mention(e.actorId)}  ·  ${when}${why}`;
    });
    const header = "-# CHANGE · BALANCE · BY · WHEN";
    return reply({
      embeds: [
        panel("Point History", `${mention(target)}\n\n${header}\n${lines.join("\n")}`, {
          color: COLOR.neutral,
          footer: {
            text: `Last ${entries.length} change${entries.length === 1 ? "" : "s"}`,
          },
        }),
      ],
    });
  }

  const common = {
    guildId,
    discordId: target,
    username,
    actorId: actor.id,
    reason,
  };

  if (path === "set") {
    const result = await setPoints({ ...common, total: amount });
    return text(
      `Set ${mention(target)} to **${result.after}** points (was ${result.before}).`
    );
  }

  const delta = path === "remove" ? -amount : amount;
  const result = await adjustPoints({ ...common, delta });

  const note = result.clamped
    ? ` (they only had ${result.before}, so the balance stopped at 0)`
    : "";
  const verb = delta >= 0 ? "Awarded" : "Removed";
  return text(
    `${verb} **${Math.abs(result.delta)}** point${Math.abs(result.delta) === 1 ? "" : "s"} ${delta >= 0 ? "to" : "from"} ${mention(target)}${note}. New total: **${result.after}**.`
  );
}

// --- /leaderboard -----------------------------------------------------------

async function handleLeaderboard(
  interaction: Interaction,
  guildId: string
): Promise<InteractionResponse> {
  const actor = actorOf(interaction);
  const rows = await leaderboard(guildId, 15);
  const me = await getMember(guildId, actor.id);
  const position = await rankPosition(guildId, actor.id);

  // Public on purpose: a leaderboard nobody else can see is not a leaderboard.
  return reply(
    {
      embeds: [
        leaderboardEmbed(
          rows.map((r) => ({
            discordId: r.discordId,
            username: r.username,
            points: r.points,
          })),
          { position, points: me?.points ?? 0 }
        ),
      ],
    },
    { ephemeral: false }
  );
}

// --- /promote ---------------------------------------------------------------

async function handlePromote(
  interaction: Interaction,
  guildId: string,
  config: EngineConfig,
  path: string
): Promise<InteractionResponse> {
  const actor = actorOf(interaction);

  if (path === "list") {
    if (!hasTier(interaction.member, config, Tier.Command)) {
      return refuse(Tier.Command);
    }
    const open = await pendingRequests(guildId, 15);
    if (open.length === 0) return text("No promotion requests are waiting.");
    const lines = open.map(
      (r, i) =>
        `${ordinal(i + 1)}  ${mention(r.discordId)}  ·  **${r.toLabel}**  ·  ${fmtPoints(r.pointsAtRequest)} pts  ·  <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`
    );
    const header = "-# PERSONNEL · REQUESTED RANK · POINTS · FILED";
    return reply({
      embeds: [
        panel("Pending Promotion Requests", `${header}\n${lines.join("\n")}`, {
          color: COLOR.pending,
          footer: { text: "Decide them on the panels in the review channel." },
        }),
      ],
    });
  }

  // path === "request"
  const result = await createRequest(config, guildId, actor.id, actor.name);
  if (!result.ok) return text(result.message);
  return text(
    `Request filed. High Command has been asked to advance you to **${result.to.label}**. If they approve it, the role will simply appear on you.`
  );
}

// --- /announce --------------------------------------------------------------

// Colour names accepted by the command, mapped to the palette. Anything else
// falls back to blue rather than erroring: a mistyped colour is not a reason to
// throw away someone's announcement.
const ANNOUNCE_COLOURS: Record<string, number> = {
  info: COLOR.info,
  neutral: COLOR.neutral,
  pending: COLOR.pending,
  approved: COLOR.approved,
  denied: COLOR.denied,
};

/**
 * Open the compose box.
 *
 * The command itself takes no text. A slash-command option is a single line
 * with no way to insert a paragraph break, which is useless for writing an
 * announcement — so the command answers with a modal, and the text arrives on
 * the submit. The channel and colour ride along in the modal's custom_id,
 * because a modal submission carries nothing else forward from the command that
 * opened it.
 */
function handleAnnounce(
  interaction: Interaction,
  config: EngineConfig,
  opts: Opts
): InteractionResponse {
  if (!hasTier(interaction.member, config, Tier.Command)) {
    return refuse(Tier.Command, "post announcements");
  }

  const channelId = id(opts, "channel");
  if (!channelId) return text("No channel was given.");
  const colour = str(opts, "colour", "info");

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `engine:say:${colour}:${channelId}`,
      title: "New announcement",
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: "title",
              label: "Title",
              style: 1,
              required: true,
              max_length: 256,
              placeholder: "SITE-19 LOCKDOWN NOTICE",
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: "body",
              label: "Message",
              // Paragraph style: this is the one that allows line breaks.
              style: 2,
              required: true,
              max_length: 4000,
              placeholder: "Markdown works here. **Bold**, *italics*, lists.",
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: "footer",
              label: "Footer (optional)",
              style: 1,
              required: false,
              max_length: 2048,
              placeholder: "— O5 Council",
            },
          ],
        },
      ],
    },
  };
}

async function postAnnouncement(
  channelId: string,
  colour: string,
  fields: (name: string) => string
): Promise<InteractionResponse> {
  const title = fields("title").trim();
  const body = fields("body").trim();
  const footer = fields("footer").trim();

  if (!title && !body) return text("Nothing to post — it was empty.");

  const style = {
    color: ANNOUNCE_COLOURS[colour] ?? COLOR.info,
    footer: footer ? { text: footer } : undefined,
    timestamp: new Date().toISOString(),
  };
  const posted = await createMessage(channelId, {
    embeds: [
      title ? panel(title, body || undefined, style) : { description: body, ...style },
    ],
  });

  if (!posted.ok) {
    // The advice depends on the failure. A missing token is a deployment
    // problem and no amount of fiddling with channel permissions will fix it —
    // sending someone to the wrong place to look costs more than the error
    // message saves.
    const hint = posted.status === 0
      ? " — this is a deployment problem, not a channel one: check DISCORD_BOT_TOKEN in the hosting environment and redeploy."
      : " — check The Engine can view that channel and send messages with embeds in it.";
    return text(`That could not be posted to <#${channelId}>: ${posted.error}${hint}`);
  }

  return text(`Posted to <#${channelId}>.`);
}

// --- /engine ----------------------------------------------------------------

async function handleEngine(
  interaction: Interaction,
  guildId: string,
  config: EngineConfig,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  if (!hasTier(interaction.member, config, Tier.Owner)) return refuse(Tier.Owner);

  if (path === "setup") {
    const patch: Partial<EngineConfig> = { guildId };
    const map: [string, keyof EngineConfig][] = [
      ["staff_role", "staffRoleId"],
      ["high_command_role", "commandRoleId"],
      ["owner_role", "ownerRoleId"],
      ["member_role", "memberRoleId"],
      ["review_channel", "reviewChannelId"],
      ["announce_channel", "announceChannelId"],
    ];
    let changed = 0;
    for (const [option, field] of map) {
      const value = id(opts, option);
      if (value) {
        patch[field] = value;
        changed += 1;
      }
    }
    if (changed === 0) {
      return text(
        "Nothing to change — pass at least one role or channel. Run `/engine settings` to see what is set."
      );
    }
    const saved = await saveEngineConfig(patch);
    return reply({ embeds: [settingsEmbed(saved)] });
  }

  if (path === "settings") {
    return reply({ embeds: [settingsEmbed(config)] });
  }

  // --- rank ladder ---
  if (path === "rank list") {
    const ladder = await getLadder(guildId);
    if (ladder.length === 0) {
      return text(
        "The ladder is empty. Add the first rank with `/engine rank add`."
      );
    }
    const lines = ladder.map(
      (r, i) =>
        `${ordinal(i + 1)}  **${r.label}**  ·  ${roleMention(r.roleId)}  ·  ${fmtPoints(r.points)} pts`
    );
    const header = "-# RUNG · RANK · ROLE · REQUIRED";
    return reply({
      embeds: [
        panel("Promotion Ladder", `${header}\n${lines.join("\n")}`, {
          color: COLOR.info,
          footer: { text: "Members advance one rung at a time." },
        }),
      ],
    });
  }

  if (path === "rank add") {
    const roleId = id(opts, "role");
    const points = int(opts, "points");
    const label =
      str(opts, "label") ||
      interaction.data?.resolved?.roles?.[roleId]?.name ||
      "Rank";
    await upsertRung(guildId, roleId, label, points);
    return text(
      `**${label}** (${roleMention(roleId)}) now sits at **${points}** points. Check the order with \`/engine rank list\`.`
    );
  }

  if (path === "rank remove") {
    const roleId = id(opts, "role");
    const removed = await removeRung(guildId, roleId);
    return text(
      removed
        ? `Removed **${removed.label}** from the ladder. Nobody's roles were changed.`
        : "That role is not on the ladder."
    );
  }

  return text("Unknown command.");
}

function settingsEmbed(config: EngineConfig): Embed {
  const show = (value: string, kind: "role" | "channel") => {
    if (!value) return "_not set_";
    return kind === "role" ? roleMention(value) : `<#${value}>`;
  };
  return panel("Configuration", undefined, {
    color: COLOR.info,
    fields: [
      {
        name: "Staff role",
        value: `${show(config.staffRoleId, "role")}\n_awards and removes points_`,
        inline: true,
      },
      {
        name: "High Command role",
        value: `${show(config.commandRoleId, "role")}\n_approves promotions_`,
        inline: true,
      },
      {
        name: "Owner role",
        value: `${show(config.ownerRoleId, "role")}\n_edits ranks and settings_`,
        inline: true,
      },
      {
        name: "Review channel",
        value: show(config.reviewChannelId, "channel"),
        inline: true,
      },
      {
        name: "Announcements",
        value: show(config.announceChannelId, "channel"),
        inline: true,
      },
      {
        name: "Member role",
        value: config.memberRoleId
          ? `${roleMention(config.memberRoleId)}\n_required for everyday commands_`
          : "_not set — everyone may check points_",
        inline: true,
      },
    ],
    footer: {
      text: "Server administrators always keep access, so the bot cannot lock itself out.",
    },
  });
}

// --- buttons and the denial modal -------------------------------------------

const DENY_MODAL_ID = (requestId: string) => `engine:promo:denyreason:${requestId}`;

async function handleComponent(
  interaction: Interaction,
  config: EngineConfig
): Promise<InteractionResponse> {
  const parsed = parseCustomId(interaction.data?.custom_id ?? "");
  if (!parsed || parsed.area !== "promo") return text("Unknown control.");

  if (!hasTier(interaction.member, config, Tier.Command)) {
    return refuse(Tier.Command);
  }

  const actor = actorOf(interaction);

  if (parsed.verb === "deny") {
    // A denial should carry a reason, so the button opens a modal rather than
    // deciding on the spot.
    return {
      type: InteractionResponseType.Modal,
      data: {
        custom_id: DENY_MODAL_ID(parsed.id),
        title: "Deny promotion request",
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.TextInput,
                custom_id: "reason",
                label: "Reason (shown to the requester)",
                style: 2,
                required: true,
                max_length: 400,
                placeholder: "What would you like them to work on?",
              },
            ],
          },
        ],
      },
    };
  }

  if (parsed.verb !== "approve") return text("Unknown control.");

  const result = await approveRequest(config, parsed.id, actor.id);
  if (!result.ok) return text(result.message);

  const request = await refreshedEmbed(config, parsed.id);
  return request ?? text(result.message);
}

async function handleModal(
  interaction: Interaction,
  config: EngineConfig
): Promise<InteractionResponse> {
  const parsed = parseCustomId(interaction.data?.custom_id ?? "");
  if (!parsed) return text("Unknown form.");

  // Both forms the bot opens — the denial reason and the announcement composer
  // — are High Command work, so the check is hoisted. It is repeated here
  // rather than trusted from the command that opened the modal: a submission is
  // a fresh interaction, and roles can have changed in between.
  if (!hasTier(interaction.member, config, Tier.Command)) {
    return refuse(
      Tier.Command,
      parsed.area === "say" ? "post announcements" : undefined
    );
  }

  const field = (name: string) =>
    interaction.data?.components
      ?.flatMap((row) => row.components)
      .find((c) => c.custom_id === name)?.value ?? "";

  // engine:say:<colour>:<channelId> — the announcement composer.
  if (parsed.area === "say") {
    return postAnnouncement(parsed.id, parsed.verb, field);
  }

  if (parsed.verb !== "denyreason") return text("Unknown form.");

  const reason = field("reason");
  const actor = actorOf(interaction);
  const result = await denyRequest(parsed.id, actor.id, reason);
  if (!result.ok) return text(result.message);

  // The modal was opened from the embed's button, so the embed is the message
  // this interaction is attached to and can be rewritten in the same response.
  const updated = await refreshedEmbed(config, parsed.id);
  if (updated) return updated;

  await refreshRequestMessage(config, parsed.id);
  return text(result.message);
}

/**
 * Rebuild a decided request's embed as an UpdateMessage response.
 *
 * Returning type 7 replaces the very message whose button was pressed, which is
 * both faster than a REST edit and immune to the bot lacking permission to edit
 * in that channel.
 */
async function refreshedEmbed(
  config: EngineConfig,
  requestId: string
): Promise<InteractionResponse | null> {
  const request = await db.enginePromotionRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return null;

  const ladder = await getLadder(request.guildId);
  const from = ladder.find((r) => r.roleId === request.fromRoleId) ?? null;
  const to = ladder.find((r) => r.roleId === request.toRoleId) ?? {
    id: "",
    roleId: request.toRoleId,
    label: request.toLabel,
    points: request.pointsAtRequest,
  };

  return {
    type: InteractionResponseType.UpdateMessage,
    data: {
      embeds: [
        promotionEmbed({
          requestId: request.id,
          discordId: request.discordId,
          username: request.username,
          from,
          to,
          points: request.pointsAtRequest,
          status: request.status as "approved" | "denied",
          reviewerId: request.reviewerId,
          reason: request.reason,
        }),
      ],
      // Buttons are dropped, so a decided request cannot be decided twice by
      // someone scrolling back to it.
      components: [] as MessageComponent[],
    },
  };
}

// --- entry point ------------------------------------------------------------

export async function handleInteraction(
  interaction: Interaction
): Promise<InteractionResponse> {
  if (interaction.type === InteractionType.Ping) {
    return { type: InteractionResponseType.Pong };
  }

  const guildId = interaction.guild_id;
  if (!guildId) {
    return text("The Engine only works inside the server, not in DMs.");
  }

  const config = await getEngineConfig();

  // The base gate. Everything the bot does, including pressing a button, is
  // behind at least this — which is what makes the optional member role a real
  // lock rather than a decoration.
  if (tierOf(interaction.member, config) === Tier.None) {
    return refuse(Tier.Member);
  }

  if (interaction.type === InteractionType.MessageComponent) {
    return handleComponent(interaction, config);
  }
  if (interaction.type === InteractionType.ModalSubmit) {
    return handleModal(interaction, config);
  }
  if (interaction.type !== InteractionType.ApplicationCommand) {
    return text("Unsupported interaction.");
  }

  const name = interaction.data?.name ?? "";
  const { path, opts } = route(interaction.data?.options);

  switch (name) {
    case "points":
      return handlePoints(interaction, guildId, config, path, opts);
    case "leaderboard":
      return handleLeaderboard(interaction, guildId);
    case "announce":
      return handleAnnounce(interaction, config, opts);
    case "promote":
      return handlePromote(interaction, guildId, config, path);
    case "engine":
      return handleEngine(interaction, guildId, config, path, opts);
    default:
      return text("Unknown command.");
  }
}
