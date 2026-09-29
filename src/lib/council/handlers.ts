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
  type InteractionMember,
  type InteractionOption,
  type MessagePayload,
} from "@/lib/discord/types";
import { executeWebhook } from "@/lib/discord/rest";
import {
  handleSecurity,
  securityAlert,
  securityGate,
  throttle,
  type Access,
  type SecurityProfile,
} from "@/lib/discord/guard";
import { listOf, roleGrantProblem } from "@/lib/discord/security";
import { isWebhookUrl } from "@/lib/engine/config";
import { isFormUrl } from "@/lib/engine/applications";
import { isGuildAdmin } from "@/lib/engine/permissions";
import {
  getCouncilConfig,
  getDivisionConfigs,
  rest,
  reviewChannelFor,
  saveCouncilConfig,
  saveDivisionConfig,
  type CouncilConfig,
  type DivisionConfig,
  type DivisionConfigs,
} from "./config";
import {
  DIVISION_KEYS,
  DIVISIONS,
  divisionLabel,
  isDivision,
  type DivisionKey,
} from "./divisions";
import {
  activeShiftsEmbed,
  applicationPrompt,
  doublePointsEmbed,
  leaderboardEmbed,
  mention,
  ordinal,
  panel,
  parseCustomId,
  points as fmtPoints,
  pointsLogEmbed,
  roleMention,
  rungLabel,
  shiftAdminButtons,
  shiftButtons,
  shiftDeleteConfirm,
  shiftEmbed,
} from "./embeds";
import { assignDivision, currentDivision, removeFromDivision } from "./membership";
import {
  canAward,
  canReview,
  isHands,
  isMember,
  isScarlet,
  reviewableDivisions,
} from "./permissions";
import {
  adjustPoints,
  getStanding,
  leaderboard,
  pointHistory,
  rankPosition,
  setPoints,
  standingsOf,
} from "./points";
import { getLadders, nextStep, removeRung, upsertRung } from "./ranks";
import {
  approveRequest,
  createRequest,
  denyRequest,
  getRequest,
  pendingRequests,
  refreshRequestMessage,
  renderRequest,
} from "./promotions";
import {
  MAX_DOUBLE_MINUTES,
  formatDuration,
  parseMinutes,
  shiftMultiplier,
} from "./shift-points";
import {
  activeShifts,
  addShiftTime,
  deleteShift,
  endShift,
  getActiveShift,
  setShiftTime,
  shiftSeconds,
  shiftTotals,
  startShift,
  togglePause,
  type EndedShift,
} from "./shifts";

// THE CRIMSON HAND'S DISPATCHER.
//
// Same contract as lib/engine/handlers.ts: one signed interaction in, one JSON
// response out, inside Discord's three seconds. What differs is the question
// every privileged path asks — not "which tier are you?" but "may you do this
// IN THIS DIVISION?" — see ./permissions.ts.

export type InteractionResponse = { type: number; data?: unknown };

/** The Crimson Hand as the anti-nuke gate sees it (lib/discord/guard.ts). */
const SECURITY: SecurityProfile = {
  bot: "council",
  name: "The Crimson Hand",
  guildEnv: "COUNCIL_GUILD_ID",
  setupCommand: "/crimson setup",
  engageLabel: "Scarlet Representatives, the Hands of the O5 and server administrators",
  throttles: ["roles", "points", "announce"],
  rest,
  panel,
  saveLock: saveCouncilConfig,
};

type Ctx = {
  interaction: Interaction;
  member: InteractionMember | undefined;
  guildId: string;
  config: CouncilConfig;
  divisions: DivisionConfigs;
};

function reply(
  payload: MessagePayload,
  { ephemeral = true }: { ephemeral?: boolean } = {}
): InteractionResponse {
  return {
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { ...payload, flags: ephemeral ? MessageFlags.Ephemeral : undefined },
  };
}

const text = (content: string, ephemeral = true) =>
  reply({ content }, { ephemeral });

/** Redraw the message a button or modal came from. Content is cleared unless
 *  the payload sets it, so an old status line never lingers. */
const update = (payload: MessagePayload): InteractionResponse => ({
  type: InteractionResponseType.UpdateMessage,
  data: { content: "", ...payload },
});

/** Refusals are always private. */
const refuse = (what: string, who: string) =>
  text(`You do not have clearance to ${what}. This is limited to ${who}.`);

/** "Judicial HR" for Judicial and both of its subdivisions. */
const hrLabel = (division: DivisionKey) =>
  `${DIVISIONS[DIVISIONS[division].parent].label} HR`;

const hrOf = (division: DivisionKey) =>
  `${hrLabel(division)}, Scarlet Representatives and the Hands of the O5`;

// --- option plumbing (as in The Engine) -------------------------------------

type Opts = Map<string, string | number | boolean>;

function route(options: InteractionOption[] | undefined): {
  path: string;
  opts: Opts;
} {
  const parts: string[] = [];
  let level = options ?? [];
  for (;;) {
    const node = level.find((o) => o.type === 1 || o.type === 2);
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

const num = (opts: Opts, name: string, fallback = 0) =>
  typeof opts.get(name) === "number" ? (opts.get(name) as number) : fallback;

const id = (opts: Opts, name: string): string => str(opts, name);

const divisionOpt = (opts: Opts): DivisionKey | null => {
  const value = str(opts, "division");
  return isDivision(value) ? value : null;
};

function resolvedName(interaction: Interaction, userId: string): string {
  const user = interaction.data?.resolved?.users?.[userId];
  const member = interaction.data?.resolved?.members?.[userId];
  return displayNameOf(member ? { ...member, roles: [] } : undefined, user);
}

// --- /points ----------------------------------------------------------------

async function handlePoints(
  ctx: Ctx,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  const { interaction, guildId } = ctx;
  const actor = actorOf(interaction);

  if (path === "check") {
    const target = id(opts, "user") || actor.id;
    const self = target === actor.id;
    const division = divisionOpt(opts) ?? (await currentDivision(guildId, target));
    if (!division) {
      return text(
        self
          ? "You are not in a division yet, so you have no points to show."
          : `${mention(target)} is not in a division.`
      );
    }

    const standing = await getStanding(guildId, target, division);
    const points = standing?.points ?? 0;
    const ladders = await getLadders(guildId);
    const where = nextStep(ladders, division, points, standing?.rankRoleId ?? null);
    const position = await rankPosition(guildId, target, division);

    const fields = [
      { name: "Division", value: divisionLabel(division), inline: true },
      { name: "Points", value: `**${fmtPoints(points)}**`, inline: true },
      {
        name: "Standing",
        value: position ? ordinal(position) : "Unranked",
        inline: true,
      },
      { name: "Rank", value: rungLabel(where.current), inline: false },
    ];

    if (where.next && where.toDivision) {
      const into =
        where.toDivision !== division ? ` in ${divisionLabel(where.toDivision)}` : "";
      const app = where.next.requiresApplication;
      fields.push({
        name: "Next rank",
        value: where.eligible
          ? `**${where.next.label}**${into}: eligible now. Run \`/promote request\`${app ? " to apply" : ""}.`
          : `**${where.next.label}**${into}: ${where.shortfall} more point${where.shortfall === 1 ? "" : "s"} needed${app ? ", then an application" : ""}.`,
        inline: false,
      });
    } else if (where.current) {
      fields.push({
        name: "Next rank",
        value: "At the top of this division. Anything above it is handpicked.",
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

  const target = id(opts, "user");
  if (!target) return text("No member was given.");

  const division = divisionOpt(opts) ?? (await currentDivision(guildId, target));
  if (!division) {
    return text(
      `${mention(target)} is not in a division. Assign them with \`/division assign\` first.`
    );
  }
  if (!canAward(ctx.member, ctx.config, ctx.divisions, division)) {
    return refuse(
      `manage points in ${divisionLabel(division)}`,
      `that division's staff and HR`
    );
  }

  if (path === "history") {
    const entries = await pointHistory(guildId, target, division, num(opts, "limit", 10));
    if (entries.length === 0) {
      return text(
        `No point changes on record for ${mention(target)} in ${divisionLabel(division)}.`
      );
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
        panel(
          "Point History",
          `${mention(target)} · ${divisionLabel(division)}\n\n${header}\n${lines.join("\n")}`,
          {
            color: COLOR.neutral,
            footer: {
              text: `Last ${entries.length} change${entries.length === 1 ? "" : "s"}`,
            },
          }
        ),
      ],
    });
  }

  // Taking points away is how a leaderboard gets wiped, so it is counted.
  if (path === "set" || path === "remove") {
    const slowed = await throttle(SECURITY, interaction, ctx.config, "points");
    if (slowed) return text(slowed);
  }

  const reason = str(opts, "reason");
  const amount = num(opts, "amount");
  const common = {
    guildId,
    discordId: target,
    division,
    username: resolvedName(interaction, target),
    actorId: actor.id,
    reason,
  };

  if (path === "set") {
    const result = await setPoints({ ...common, total: amount });
    const logged = await logPoints(ctx.config, {
      kind: "set",
      division,
      discordId: target,
      ...result,
      actorId: actor.id,
      reason,
    });
    return text(
      `Set ${mention(target)} to **${result.after}** points in ${divisionLabel(division)} (was ${result.before}).${logged}`
    );
  }

  const delta = path === "remove" ? -amount : amount;
  const result = await adjustPoints({ ...common, delta });
  const logged = await logPoints(ctx.config, {
    kind: delta >= 0 ? "add" : "remove",
    division,
    discordId: target,
    ...result,
    actorId: actor.id,
    reason,
  });
  const note = result.clamped
    ? ` (they only had ${result.before}, so the balance stopped at 0)`
    : "";
  const n = Math.abs(result.delta);
  return text(
    `${delta >= 0 ? "Awarded" : "Removed"} **${n}** point${n === 1 ? "" : "s"} ${delta >= 0 ? "to" : "from"} ${mention(target)} in ${divisionLabel(division)}${note}. New total: **${result.after}**.${logged}`
  );
}

async function logPoints(
  config: CouncilConfig,
  change: Parameters<typeof pointsLogEmbed>[0]
): Promise<string> {
  if (!config.pointsWebhookUrl || change.delta === 0) return "";
  const posted = await executeWebhook(config.pointsWebhookUrl, {
    embeds: [pointsLogEmbed(change)],
  });
  return posted.ok
    ? ""
    : `\n-# The public points log could not be posted: ${posted.error} Re-run \`/crimson setup points_webhook\` with a fresh webhook URL.`;
}

// --- /leaderboard -----------------------------------------------------------

async function handleLeaderboard(
  ctx: Ctx,
  opts: Opts
): Promise<InteractionResponse> {
  const actor = actorOf(ctx.interaction);
  const division =
    divisionOpt(opts) ?? (await currentDivision(ctx.guildId, actor.id));
  if (!division) {
    return text("Pick a division. You are not in one, so there is no default.");
  }
  const rows = await leaderboard(ctx.guildId, division, 15);
  const me = await getStanding(ctx.guildId, actor.id, division);
  const position = await rankPosition(ctx.guildId, actor.id, division);
  return reply(
    {
      embeds: [
        leaderboardEmbed(
          division,
          rows.map((r) => ({ discordId: r.discordId, points: r.points })),
          { position, points: me?.points ?? 0 }
        ),
      ],
    },
    { ephemeral: false }
  );
}

// --- /promote ---------------------------------------------------------------

async function handlePromote(
  ctx: Ctx,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  const actor = actorOf(ctx.interaction);

  if (path === "list") {
    const mine = reviewableDivisions(ctx.member, ctx.config, ctx.divisions);
    const only = divisionOpt(opts);
    const scope = only ? mine.filter((d) => d === only) : mine;
    if (scope.length === 0) {
      return refuse(
        only ? `review ${divisionLabel(only)} promotions` : "review promotions",
        only ? hrOf(only) : "division HR"
      );
    }
    const open = await pendingRequests(ctx.guildId, scope, 15);
    if (open.length === 0) return text("No promotion requests are waiting for you.");
    const lines = open.map(
      (r, i) =>
        `${ordinal(i + 1)}  ${mention(r.discordId)}  ·  ${divisionLabel(r.toDivision)}  ·  **${r.toLabel}**  ·  ${fmtPoints(r.pointsAtRequest)} pts  ·  <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`
    );
    const header = "-# PERSONNEL · DIVISION · REQUESTED RANK · POINTS · FILED";
    return reply({
      embeds: [
        panel("Pending Promotion Requests", `${header}\n${lines.join("\n")}`, {
          color: COLOR.pending,
          footer: { text: "Decide them on the panels in each review channel." },
        }),
      ],
    });
  }

  const result = await createRequest(ctx.divisions, ctx.guildId, actor.id, actor.name);
  if (!result.ok) {
    return "apply" in result
      ? reply(applicationPrompt(result.apply))
      : text(result.message);
  }
  return text(
    `Request filed. ${hrLabel(result.toDivision)} has been asked to advance you to **${result.to.label}**. If they approve it, the role will simply appear on you.`
  );
}

// --- /division --------------------------------------------------------------

async function handleDivision(
  ctx: Ctx,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  const { interaction, guildId } = ctx;

  if (path === "info") {
    const target = id(opts, "user") || actorOf(interaction).id;
    const active = await currentDivision(guildId, target);
    const standings = await standingsOf(guildId, target);
    const ladders = await getLadders(guildId);
    const all = Object.values(ladders).flat();
    const lines = standings
      .filter((s) => isDivision(s.division))
      .map((s) => {
        const rung = all.find((r) => r.roleId === s.rankRoleId) ?? null;
        const here = s.division === active ? "  ◀ current" : "";
        return `**${divisionLabel(s.division)}**  ·  ${fmtPoints(s.points)} pts  ·  ${rungLabel(rung)}${here}`;
      });
    return reply({
      embeds: [
        panel(
          "Division Record",
          `${mention(target)}\nCurrently in: **${divisionLabel(active)}**\n\n${lines.length ? lines.join("\n") : "_No standing in any division yet._"}`,
          { color: COLOR.neutral }
        ),
      ],
    });
  }

  const target = id(opts, "user");
  if (!target) return text("No member was given.");
  const previous = await currentDivision(guildId, target);

  if (path === "remove") {
    if (!previous) return text(`${mention(target)} is not in a division.`);
    if (!canReview(ctx.member, ctx.config, ctx.divisions, previous)) {
      return refuse(`remove members from ${divisionLabel(previous)}`, hrOf(previous));
    }
    const slowed = await throttle(SECURITY, interaction, ctx.config, "roles");
    if (slowed) return text(slowed);
    const out = await removeFromDivision(ctx.divisions, guildId, target);
    return text(out.message);
  }

  // path === "assign"
  const division = divisionOpt(opts);
  if (!division) return text("No division was given.");
  // A transfer takes authority over BOTH divisions, so one division's HR
  // cannot quietly take members from another.
  if (!canReview(ctx.member, ctx.config, ctx.divisions, division)) {
    return refuse(`assign members to ${divisionLabel(division)}`, hrOf(division));
  }
  if (previous && !canReview(ctx.member, ctx.config, ctx.divisions, previous)) {
    return refuse(
      `transfer members out of ${divisionLabel(previous)}`,
      hrOf(previous)
    );
  }
  // Counted because a transfer strips the old division's roles.
  const slowed = await throttle(SECURITY, interaction, ctx.config, "roles");
  if (slowed) return text(slowed);
  const out = await assignDivision(
    ctx.divisions,
    guildId,
    target,
    resolvedName(interaction, target),
    division
  );
  return text(out.ok ? `${mention(target)}: ${out.message}` : out.message);
}

// --- /shift -----------------------------------------------------------------

async function handleShift(
  ctx: Ctx,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  // The panels are posted in the open so the channel can see who is on duty.
  // The buttons still only answer their owner (or HR, on the admin panel), and
  // refusals stay private.
  if (path === "manage") {
    return reply(await shiftPanel(ctx, actorOf(ctx.interaction).id, false), {
      ephemeral: false,
    });
  }

  if (path === "active") {
    const now = new Date();
    const rows = (await activeShifts(ctx.guildId)).map((shift) => ({
      discordId: shift.discordId,
      division: shift.division,
      seconds: shiftSeconds(shift, now),
      paused: !!shift.pausedAt,
    }));
    return reply(
      { embeds: [activeShiftsEmbed(rows, ctx.config.doublePointsUntil)] },
      { ephemeral: false }
    );
  }

  if (path === "double start" || path === "double end") {
    return handleDoublePoints(ctx, path, opts);
  }

  // path === "admin"
  const target = id(opts, "user");
  if (!target) return text("No member was given.");
  const refused = await shiftAuthority(ctx, target);
  if (refused) return refused;
  return reply(await shiftPanel(ctx, target, true), { ephemeral: false });
}

/** The panel for one member's shift: their own (/shift manage) or HR's view. */
async function shiftPanel(
  ctx: Ctx,
  discordId: string,
  admin: boolean,
  content?: string
): Promise<MessagePayload> {
  const [active, totals, division] = await Promise.all([
    getActiveShift(ctx.guildId, discordId),
    shiftTotals(ctx.guildId, discordId),
    currentDivision(ctx.guildId, discordId),
  ]);
  return {
    content,
    embeds: [
      shiftEmbed({
        discordId,
        active,
        seconds: active ? shiftSeconds(active) : 0,
        totals,
        division,
        doublePointsUntil: ctx.config.doublePointsUntil,
      }),
    ],
    components: admin
      ? shiftAdminButtons(discordId, active)
      : shiftButtons(discordId, active),
    // Public now: "Started a shift for @someone" should not ping them.
    allowed_mentions: { parse: [] },
  };
}

/**
 * /shift double start | end. Scarlet and Hands only: it changes what every
 * shift in every division pays. Announced where it was run, since members need
 * to know to end their shifts inside the window, and reported to the security
 * channel like any other settings change.
 */
async function handleDoublePoints(
  ctx: Ctx,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  if (!isScarlet(ctx.member, ctx.config)) {
    return refuse(
      "turn double points on or off",
      "Scarlet Representatives and the Hands of the O5"
    );
  }
  const actor = actorOf(ctx.interaction);
  const now = new Date();
  const running = shiftMultiplier(ctx.config.doublePointsUntil, now) > 1;

  if (path === "double end") {
    if (!running) return text("Double points are not on.");
    await saveCouncilConfig({ doublePointsUntil: null, doublePointsById: actor.id });
    await securityAlert(
      SECURITY,
      ctx.config,
      "Double Points Ended",
      `${mention(actor.id)} ended double shift points early with \`/shift double end\`.`,
      COLOR.info
    );
    return reply(
      {
        embeds: [
          panel(
            "Double Points Ended",
            `Shifts pay the usual points again. Shifts that ended during the window keep their double points.\n-# Ended by ${mention(actor.id)}`,
            { color: COLOR.neutral, timestamp: now.toISOString() }
          ),
        ],
      },
      { ephemeral: false }
    );
  }

  const typed = str(opts, "duration");
  const minutes = parseMinutes(typed);
  if (minutes === null || minutes < 1 || minutes > MAX_DOUBLE_MINUTES) {
    return text(
      `"${typed.trim().slice(0, 20)}" is not a length between 1 minute and ${MAX_DOUBLE_MINUTES / 60} hours. Use minutes (\`90\`), \`2h\`, \`1h30m\` or \`1:30\`. Nothing was changed.`
    );
  }
  const until = new Date(now.getTime() + minutes * 60_000);
  const saved = await saveCouncilConfig({
    guildId: ctx.guildId,
    doublePointsUntil: until,
    doublePointsById: actor.id,
  });
  const replaced = running ? ctx.config.doublePointsUntil : null;
  await securityAlert(
    SECURITY,
    saved,
    "Double Points Started",
    `${mention(actor.id)} turned on double shift points for ${formatDuration(minutes * 60)} with \`/shift double start\`, until <t:${Math.floor(until.getTime() / 1000)}:f>.`,
    COLOR.info
  );
  return reply(
    { embeds: [doublePointsEmbed(until, actor.id, replaced)] },
    { ephemeral: false }
  );
}

/**
 * Null when the actor may run /shift admin on this member: HR of the division
 * the shift is in (or the member's division, when they are off shift), and
 * Scarlet and Hands everywhere.
 */
async function shiftAuthority(
  ctx: Ctx,
  target: string
): Promise<InteractionResponse | null> {
  const active = await getActiveShift(ctx.guildId, target);
  const division =
    active && isDivision(active.division)
      ? active.division
      : await currentDivision(ctx.guildId, target);
  if (division) {
    return canReview(ctx.member, ctx.config, ctx.divisions, division)
      ? null
      : refuse(`manage ${divisionLabel(division)} shifts`, hrOf(division));
  }
  return isScarlet(ctx.member, ctx.config)
    ? null
    : refuse(
        "manage the shifts of members outside a division",
        "Scarlet Representatives and the Hands of the O5"
      );
}

async function beginShift(ctx: Ctx, discordId: string, username: string) {
  const division = await currentDivision(ctx.guildId, discordId);
  if (!division) {
    return {
      ok: false as const,
      message:
        "Only members of a division can go on shift: the points need somewhere to go. Division HR assigns one with `/division assign`.",
    };
  }
  return startShift(ctx.guildId, discordId, username, division);
}

/** "…shift ended after …", with where the points went. Posts the public log. */
async function endedLine(ctx: Ctx, whose: string, ended: EndedShift): Promise<string> {
  const length = `**${formatDuration(ended.seconds)}**`;
  if (!ended.paid || !ended.division) {
    return `${whose} shift ended after ${length}. Shifts under 10 minutes earn no points.`;
  }
  const logged = await logPoints(ctx.config, {
    kind: "add",
    division: ended.division,
    discordId: ended.shift.discordId,
    ...ended.paid,
    actorId: actorOf(ctx.interaction).id,
    reason: ended.reason,
  });
  const n = ended.paid.delta;
  const doubled = ended.multiplier > 1 ? ` (${ended.multiplier}× double points)` : "";
  return `${whose} shift ended after ${length}: **${fmtPoints(n)}** point${n === 1 ? "" : "s"}${doubled} paid into ${divisionLabel(ended.division)}. New total: **${fmtPoints(ended.paid.after)}**.${logged}`;
}

/** Start / Pause / End on a member's own panel. */
async function handleShiftButton(
  ctx: Ctx,
  verb: string,
  owner: string
): Promise<InteractionResponse> {
  const actor = actorOf(ctx.interaction);
  if (actor.id !== owner) {
    return text("That panel belongs to someone else. Run `/shift manage` for your own.");
  }
  const panelWith = async (content: string) =>
    update(await shiftPanel(ctx, actor.id, false, content));

  if (verb === "start") {
    const started = await beginShift(ctx, actor.id, actor.name);
    return panelWith(started.ok ? "You are on shift. The clock is running." : started.message);
  }
  if (verb === "pause") {
    const toggled = await togglePause(ctx.guildId, actor.id);
    if (!toggled.ok) return panelWith(toggled.message);
    return panelWith(
      toggled.shift.pausedAt
        ? "On break. The clock is stopped until you press Resume."
        : "Back on shift. The clock is running again."
    );
  }
  if (verb === "end") {
    const ended = await endShift(
      ctx.guildId,
      actor.id,
      actor.id,
      ctx.config.doublePointsUntil
    );
    return panelWith(ended.ok ? await endedLine(ctx, "Your", ended.shift) : ended.message);
  }
  return text("Unknown control.");
}

function minutesModal(verb: "addtime" | "settime", target: string): InteractionResponse {
  const adding = verb === "addtime";
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `council:shiftadm:${verb}:${target}`,
      title: adding ? "Add time to their shift" : "Set their shift time",
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: "minutes",
              label: adding ? "Time to add" : "Their shift should read",
              style: 1,
              required: true,
              max_length: 20,
              placeholder: "90, 1h30m or 1:30",
            },
          ],
        },
      ],
    },
  };
}

/** HR's buttons on /shift admin. Authority is checked again on every press. */
async function handleShiftAdminButton(
  ctx: Ctx,
  verb: string,
  target: string
): Promise<InteractionResponse> {
  const refused = await shiftAuthority(ctx, target);
  if (refused) return refused;
  const who = mention(target);
  const panelWith = async (content?: string) =>
    update(await shiftPanel(ctx, target, true, content));

  switch (verb) {
    case "panel":
      return panelWith();
    case "start": {
      const started = await beginShift(ctx, target, "");
      return panelWith(started.ok ? `Started a shift for ${who}.` : started.message);
    }
    case "end": {
      const ended = await endShift(
        ctx.guildId,
        target,
        actorOf(ctx.interaction).id,
        ctx.config.doublePointsUntil
      );
      return panelWith(ended.ok ? await endedLine(ctx, `${who}'s`, ended.shift) : ended.message);
    }
    case "add":
      return minutesModal("addtime", target);
    case "set":
      return minutesModal("settime", target);
    case "delete": {
      const shift = await getActiveShift(ctx.guildId, target);
      if (!shift) return panelWith("They are not on shift.");
      return update({
        content: `Delete ${who}'s current shift (**${formatDuration(shiftSeconds(shift))}** so far)? It is thrown away and **no points** are paid.`,
        embeds: [],
        components: shiftDeleteConfirm(target),
      });
    }
    case "deleteyes": {
      const slowed = await throttle(SECURITY, ctx.interaction, ctx.config, "points");
      if (slowed) return text(slowed);
      const deleted = await deleteShift(ctx.guildId, target);
      return panelWith(
        deleted.ok
          ? `Deleted ${who}'s shift of ${formatDuration(shiftSeconds(deleted.shift))}. No points were paid.`
          : deleted.message
      );
    }
    default:
      return text("Unknown control.");
  }
}

/** The Add time / Set time forms from /shift admin. */
async function handleShiftTimeModal(
  ctx: Ctx,
  verb: string,
  target: string,
  typed: string
): Promise<InteractionResponse> {
  const refused = await shiftAuthority(ctx, target);
  if (refused) return refused;
  const panelWith = async (content: string) =>
    update(await shiftPanel(ctx, target, true, content));

  const minutes = parseMinutes(typed);
  if (minutes === null) {
    return panelWith(
      `"${typed.trim().slice(0, 20)}" is not a length of time. Use minutes (\`90\`), \`1h30m\` or \`1:30\`, up to one week. Nothing was changed.`
    );
  }
  const shown = formatDuration(minutes * 60);
  if (verb === "addtime") {
    if (minutes === 0) return panelWith("Nothing to add.");
    const added = await addShiftTime(ctx.guildId, target, minutes);
    return panelWith(added.ok ? `Added ${shown} to ${mention(target)}'s shift.` : added.message);
  }
  if (verb !== "settime") return text("Unknown form.");
  // Setting can take time away, which is a point removal by another route.
  const slowed = await throttle(SECURITY, ctx.interaction, ctx.config, "points");
  if (slowed) return text(slowed);
  const set = await setShiftTime(ctx.guildId, target, minutes);
  return panelWith(
    set.ok
      ? `${mention(target)}'s shift now reads ${shown}. It keeps running from there.`
      : set.message
  );
}

// --- /announce --------------------------------------------------------------

const ANNOUNCE_COLOURS: Record<string, number> = {
  info: COLOR.info,
  neutral: COLOR.neutral,
  pending: COLOR.pending,
  approved: COLOR.approved,
  denied: COLOR.denied,
};

function handleAnnounce(ctx: Ctx, opts: Opts): InteractionResponse {
  if (!isScarlet(ctx.member, ctx.config)) {
    return refuse("post announcements", "Scarlet Representatives and the Hands of the O5");
  }
  const channelId = id(opts, "channel");
  if (!channelId) return text("No channel was given.");
  const colour = str(opts, "colour", "info");

  const input = (
    custom_id: string,
    label: string,
    style: number,
    required: boolean,
    max_length: number,
    placeholder: string
  ) => ({
    type: ComponentType.ActionRow,
    components: [
      { type: ComponentType.TextInput, custom_id, label, style, required, max_length, placeholder },
    ],
  });

  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: `council:say:${colour}:${channelId}`,
      title: "New announcement",
      components: [
        input("title", "Title", 1, true, 256, "CRIMSON HAND NOTICE"),
        input("body", "Message", 2, true, 4000, "Markdown works here. **Bold**, *italics*, lists."),
        input("footer", "Footer (optional)", 1, false, 2048, "— Hands of the O5"),
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
  if (!title && !body) return text("Nothing to post. It was empty.");

  const style = {
    color: ANNOUNCE_COLOURS[colour] ?? COLOR.info,
    footer: footer ? { text: footer } : undefined,
    timestamp: new Date().toISOString(),
  };
  const posted = await rest.createMessage(channelId, {
    embeds: [title ? panel(title, body || undefined, style) : { description: body, ...style }],
  });
  if (!posted.ok) {
    const hint =
      posted.status === 0
        ? " This is a deployment problem, not a channel one: check COUNCIL_BOT_TOKEN in the hosting environment and redeploy."
        : " Check The Crimson Hand can view that channel and send messages with embeds in it.";
    return text(`That could not be posted to <#${channelId}>: ${posted.error}${hint}`);
  }
  return text(`Posted to <#${channelId}>.`);
}

// --- /crimson ---------------------------------------------------------------

async function handleCrimson(
  ctx: Ctx,
  path: string,
  opts: Opts
): Promise<InteractionResponse> {
  const { interaction, guildId } = ctx;
  if (!isHands(ctx.member, ctx.config)) {
    return refuse("change The Crimson Hand's configuration", "the Hands of the O5");
  }
  const actor = actorOf(interaction);

  /** Why the bot must not hand this role out, reported to the security
   *  channel; null when it may. Checked here for a clear answer up front, and
   *  again on every grant (lib/discord/rest.ts), since roles can be edited. */
  const unsafeRole = async (roleId: string, attempt: string) => {
    const role = interaction.data?.resolved?.roles?.[roleId];
    const problem = role ? roleGrantProblem(role, guildId) : null;
    if (problem) {
      await securityAlert(
        SECURITY,
        ctx.config,
        "Unsafe Role Refused",
        `${mention(actor.id)} tried to ${attempt}. ${problem}`
      );
    }
    return problem;
  };

  if (path === "setup") {
    // Who holds full control of the bot, and where its alarms go, are for
    // server administrators alone. Hands who could change either could give
    // the bot away or quietly silence its security alerts.
    if (
      (id(opts, "hands_role") || id(opts, "security_channel")) &&
      !isGuildAdmin(ctx.member)
    ) {
      return text(
        "Only server administrators can change the Hands of the O5 role or the security channel. Nothing was saved."
      );
    }

    const patch: Partial<CouncilConfig> = { guildId };
    // Every setting ending in "Id" holds a role or channel id (a string).
    const map: [string, keyof CouncilConfig & `${string}Id`][] = [
      ["hands_role", "handsRoleId"],
      ["scarlet_role", "scarletRoleId"],
      ["member_role", "memberRoleId"],
      ["announce_channel", "announceChannelId"],
      ["security_channel", "securityChannelId"],
    ];
    const changed: string[] = [];
    for (const [option, field] of map) {
      const value = id(opts, option);
      if (value) {
        patch[field] = value;
        changed.push(`\`${option}\``);
      }
    }
    const webhook = str(opts, "points_webhook").trim();
    if (webhook) {
      if (webhook.toLowerCase() === "off") patch.pointsWebhookUrl = "";
      else if (isWebhookUrl(webhook)) patch.pointsWebhookUrl = webhook;
      else {
        return text(
          "That is not a Discord webhook URL. In the channel's settings go to **Integrations → Webhooks → New Webhook → Copy Webhook URL**, and paste that. Nothing was saved."
        );
      }
      changed.push("`points_webhook`");
    }
    if (changed.length === 0) {
      return text("Nothing to change. Pass at least one role or channel, or run `/crimson settings` to see what is set.");
    }
    const saved = await saveCouncilConfig(patch);
    await securityAlert(
      SECURITY,
      saved,
      "Settings Changed",
      `${mention(actor.id)} changed ${listOf(changed)} with \`/crimson setup\`.`,
      COLOR.info
    );
    return reply({ embeds: [settingsEmbed(saved, ctx.divisions)] });
  }

  if (path === "division") {
    const division = divisionOpt(opts);
    if (!division) return text("No division was given.");
    const patch: Partial<DivisionConfig> = {};
    const map: [string, keyof DivisionConfig][] = [
      ["hr_role", "reviewerRoleId"],
      ["staff_role", "staffRoleId"],
      ["review_channel", "reviewChannelId"],
      ["division_role", "divisionRoleId"],
    ];
    const changed: string[] = [];
    for (const [option, field] of map) {
      const value = id(opts, option);
      if (value) {
        patch[field] = value;
        changed.push(`\`${option}\``);
      }
    }
    if (changed.length === 0) {
      return text("Nothing to change. Pass at least one role or channel.");
    }
    // The division role is handed to everyone assigned, so it is checked like
    // a rank. The HR and staff roles are never handed out by the bot.
    if (patch.divisionRoleId) {
      const unsafe = await unsafeRole(
        patch.divisionRoleId,
        `make ${roleMention(patch.divisionRoleId)} the ${divisionLabel(division)} division role`
      );
      if (unsafe) return text(`${unsafe} Nothing was saved.`);
    }
    // Remember the server id too: the first config command run may be this one.
    if (!ctx.config.guildId) await saveCouncilConfig({ guildId });
    const saved = await saveDivisionConfig(guildId, division, patch);
    await securityAlert(
      SECURITY,
      ctx.config,
      "Settings Changed",
      `${mention(actor.id)} changed ${listOf(changed)} for ${divisionLabel(division)} with \`/crimson division\`.`,
      COLOR.info
    );
    return reply({
      embeds: [
        settingsEmbed(ctx.config, { ...ctx.divisions, [division]: saved }),
      ],
    });
  }

  if (path === "settings") {
    return reply({ embeds: [settingsEmbed(ctx.config, ctx.divisions)] });
  }

  if (path === "rank list") {
    const ladders = await getLadders(guildId);
    const only = divisionOpt(opts);
    const keys = only ? [only] : DIVISION_KEYS;
    const fields = keys.map((key) => {
      const ladder = ladders[key];
      const feeds = DIVISIONS[key].feedsInto;
      const tail = feeds ? `\n-# Top rank promotes into ${divisionLabel(feeds)}.` : "";
      const lines = ladder.map(
        (r, i) =>
          `${ordinal(i + 1)}  ${r.band ? `\`${r.band}\` ` : ""}**${r.label}**  ·  ${roleMention(r.roleId)}  ·  ${fmtPoints(r.points)} pts${r.requiresApplication ? " + application" : ""}`
      );
      return {
        name: DIVISIONS[key].label,
        value: ((lines.length ? lines.join("\n") : "_No ranks yet._") + tail).slice(0, 1024),
        inline: false,
      };
    });
    return reply({
      embeds: [
        panel("Division Ladders", undefined, {
          color: COLOR.info,
          fields,
          footer: { text: "Members advance one rank at a time, within their own division." },
        }),
      ],
    });
  }

  if (path === "rank add") {
    const division = divisionOpt(opts);
    if (!division) return text("No division was given.");
    const roleId = id(opts, "role");
    if (roleId === ctx.config.handsRoleId || roleId === ctx.config.scarletRoleId) {
      return text("Hands of the O5 and Scarlet Representative are handpicked and cannot be put on a ladder.");
    }
    const unsafe = await unsafeRole(
      roleId,
      `put ${roleMention(roleId)} on the ${divisionLabel(division)} ladder`
    );
    if (unsafe) return text(`${unsafe} Nothing was saved.`);
    const points = num(opts, "points");
    const label =
      str(opts, "label") ||
      interaction.data?.resolved?.roles?.[roleId]?.name ||
      "Rank";
    const band = str(opts, "band") || undefined;

    const form = str(opts, "form").trim();
    let applicationUrl: string | undefined;
    if (form.toLowerCase() === "off") applicationUrl = "";
    else if (form) {
      if (!isFormUrl(form)) {
        return text(
          "That is not a link. Paste the form's full address, starting with `https://`. Nothing was saved."
        );
      }
      applicationUrl = form;
    }

    const { rung, movedFrom } = await upsertRung({
      guildId,
      division,
      roleId,
      label,
      points,
      band,
      applicationUrl,
    });
    await securityAlert(
      SECURITY,
      ctx.config,
      "Ladder Changed",
      `${mention(actor.id)} put ${roleMention(roleId)} on the ${divisionLabel(division)} ladder at **${rung.points}** points.`,
      COLOR.info
    );
    const moved = movedFrom
      ? ` It was moved here from **${divisionLabel(movedFrom)}**, since a role can only sit on one ladder.`
      : "";
    const gate = rung.requiresApplication
      ? ` Members also need to fill in the [application form](${rung.applicationUrl}).`
      : "";
    return text(
      `**${label}** (${roleMention(roleId)}) now sits in **${divisionLabel(division)}** at **${points}** points.${moved}${gate} Check the order with \`/crimson rank list\`.`
    );
  }

  if (path === "rank remove") {
    const removed = await removeRung(guildId, id(opts, "role"));
    if (removed) {
      await securityAlert(
        SECURITY,
        ctx.config,
        "Ladder Changed",
        `${mention(actor.id)} took ${roleMention(removed.roleId)} off the ${divisionLabel(removed.division)} ladder.`,
        COLOR.info
      );
    }
    return text(
      removed
        ? `Removed **${removed.label}** from ${divisionLabel(removed.division)}. Nobody's roles were changed.`
        : "That role is not on any ladder."
    );
  }

  return text("Unknown command.");
}

function settingsEmbed(config: CouncilConfig, divisions: DivisionConfigs): Embed {
  const role = (v: string) => (v ? roleMention(v) : "_not set_");
  const channel = (v: string) => (v ? `<#${v}>` : "_not set_");

  const fields = [
    { name: "Hands of the O5", value: `${role(config.handsRoleId)}\n_full control_`, inline: true },
    { name: "Scarlet Representative", value: `${role(config.scarletRoleId)}\n_reviews every division_`, inline: true },
    { name: "Announcements", value: channel(config.announceChannelId), inline: true },
    {
      name: "Member role",
      value: config.memberRoleId
        ? `${role(config.memberRoleId)}\n_required for everyday commands_`
        : "_not set: everyone may use the bot_",
      inline: true,
    },
    {
      name: "Points log",
      value: config.pointsWebhookUrl ? "Webhook set" : "_not set_",
      inline: true,
    },
    {
      name: "Security alerts",
      value: config.securityChannelId
        ? channel(config.securityChannelId)
        : "_not set: see `/security status`_",
      inline: true,
    },
  ];

  for (const key of DIVISION_KEYS) {
    const d = divisions[key];
    const parent = DIVISIONS[key].parent;
    const inherited = parent !== key && !d.reviewChannelId;
    const review = inherited
      ? `${channel(reviewChannelFor(divisions, key))} _(from ${divisionLabel(parent)})_`
      : channel(d.reviewChannelId);
    const hr =
      parent !== key && !d.reviewerRoleId
        ? `${role(divisions[parent].reviewerRoleId)} _(${divisionLabel(parent)} HR)_`
        : role(d.reviewerRoleId);
    fields.push({
      name: DIVISIONS[key].label,
      value: `HR: ${hr}\nStaff: ${role(d.staffRoleId)}\nReview: ${review}\nDivision role: ${role(d.divisionRoleId)}`,
      inline: true,
    });
  }

  return panel("Configuration", undefined, {
    color: COLOR.info,
    fields,
    footer: { text: "Server administrators always keep access, so the bot cannot lock itself out." },
  });
}

// --- buttons and modals -----------------------------------------------------

async function handleComponent(ctx: Ctx): Promise<InteractionResponse> {
  const parsed = parseCustomId(ctx.interaction.data?.custom_id ?? "");

  // council:apply:done:<roleId> — "I've submitted it".
  if (parsed?.area === "apply" && parsed.verb === "done") {
    const actor = actorOf(ctx.interaction);
    const result = await createRequest(
      ctx.divisions,
      ctx.guildId,
      actor.id,
      actor.name,
      parsed.id
    );
    const message = result.ok
      ? `Application filed. ${hrLabel(result.toDivision)} will review it for **${result.to.label}**.`
      : "apply" in result
        ? "Something went wrong filing that. Run /promote request again."
        : result.message;
    return {
      type: InteractionResponseType.UpdateMessage,
      data: { content: message, embeds: [], components: [] },
    };
  }

  if (parsed?.area === "shift") return handleShiftButton(ctx, parsed.verb, parsed.id);
  if (parsed?.area === "shiftadm") {
    return handleShiftAdminButton(ctx, parsed.verb, parsed.id);
  }

  if (!parsed || parsed.area !== "promo") return text("Unknown control.");

  const request = await getRequest(parsed.id);
  if (!request || !isDivision(request.toDivision)) {
    return text("That request no longer exists.");
  }
  if (!canReview(ctx.member, ctx.config, ctx.divisions, request.toDivision)) {
    return refuse(
      `review ${divisionLabel(request.toDivision)} promotions`,
      hrOf(request.toDivision)
    );
  }

  if (parsed.verb === "deny") {
    return {
      type: InteractionResponseType.Modal,
      data: {
        custom_id: `council:promo:denyreason:${parsed.id}`,
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

  const actor = actorOf(ctx.interaction);
  const result = await approveRequest(ctx.config, ctx.divisions, parsed.id, actor.id);
  if (!result.ok) return text(result.message);
  return (await refreshedEmbed(parsed.id)) ?? text(result.message);
}

async function handleModal(ctx: Ctx): Promise<InteractionResponse> {
  const parsed = parseCustomId(ctx.interaction.data?.custom_id ?? "");
  if (!parsed) return text("Unknown form.");

  const field = (name: string) =>
    ctx.interaction.data?.components
      ?.flatMap((row) => row.components)
      .find((c) => c.custom_id === name)?.value ?? "";

  // Re-checked on submit: roles can change between opening a form and sending it.
  if (parsed.area === "say") {
    if (!isScarlet(ctx.member, ctx.config)) {
      return refuse("post announcements", "Scarlet Representatives and the Hands of the O5");
    }
    const slowed = await throttle(SECURITY, ctx.interaction, ctx.config, "announce");
    if (slowed) return text(slowed);
    return postAnnouncement(parsed.id, parsed.verb, field);
  }

  if (parsed.area === "shiftadm") {
    return handleShiftTimeModal(ctx, parsed.verb, parsed.id, field("minutes"));
  }

  if (parsed.area !== "promo" || parsed.verb !== "denyreason") {
    return text("Unknown form.");
  }
  const request = await getRequest(parsed.id);
  if (!request || !isDivision(request.toDivision)) {
    return text("That request no longer exists.");
  }
  if (!canReview(ctx.member, ctx.config, ctx.divisions, request.toDivision)) {
    return refuse(
      `review ${divisionLabel(request.toDivision)} promotions`,
      hrOf(request.toDivision)
    );
  }

  const result = await denyRequest(parsed.id, actorOf(ctx.interaction).id, field("reason"));
  if (!result.ok) return text(result.message);

  const updated = await refreshedEmbed(parsed.id);
  if (updated) return updated;
  await refreshRequestMessage(parsed.id);
  return text(result.message);
}

/** Replace the pressed message with the decided embed, buttons removed. */
async function refreshedEmbed(requestId: string): Promise<InteractionResponse | null> {
  const embed = await renderRequest(requestId);
  if (!embed) return null;
  return {
    type: InteractionResponseType.UpdateMessage,
    data: { embeds: [embed], components: [] },
  };
}

// --- entry point ------------------------------------------------------------

/**
 * Commands too slow to answer inside Discord's three seconds.
 *
 * /division assign and remove chain several database reads with one or more
 * role calls before they can say anything, and on a cold start that overruns
 * the window ("The application did not respond"). These are acknowledged
 * straight away as a private "thinking…" and the result is edited in after.
 * Every reply they give is private, so deferring them privately loses nothing.
 */
export function shouldDefer(interaction: Interaction): boolean {
  if (interaction.type !== InteractionType.ApplicationCommand) return false;
  if (interaction.data?.name !== "division") return false;
  const { path } = route(interaction.data?.options);
  return path === "assign" || path === "remove";
}

/**
 * The commands and controls that only look things up, and so keep working in
 * a lockdown. Anything not listed counts as a change, so a command added later
 * is frozen by a lockdown until someone decides otherwise. /security is listed
 * because it has to work during one; it checks its own permissions.
 */
const READ_ONLY = new Set([
  "points check",
  "points history",
  "leaderboard",
  "promote list",
  "division info",
  "shift manage", // posts the panel; its buttons are the changes
  "shift active",
  "shift admin",
  "announce", // only opens the compose box; posting it is the modal
  "crimson settings",
  "crimson rank list",
  "security lockdown",
  "security unlock",
  "security status",
]);

function accessOf(interaction: Interaction): Access {
  if (interaction.type === InteractionType.MessageComponent) {
    // Redrawing a shift panel (and "Cancel" on a delete) changes nothing.
    const parsed = parseCustomId(interaction.data?.custom_id ?? "");
    return parsed?.area === "shiftadm" && parsed.verb === "panel" ? "read" : "write";
  }
  if (interaction.type !== InteractionType.ApplicationCommand) return "write";
  const name = interaction.data?.name ?? "";
  const { path } = route(interaction.data?.options);
  return READ_ONLY.has(path ? `${name} ${path}` : name) ? "read" : "write";
}

export async function handleInteraction(
  interaction: Interaction
): Promise<InteractionResponse> {
  if (interaction.type === InteractionType.Ping) {
    return { type: InteractionResponseType.Pong };
  }

  const guildId = interaction.guild_id;
  if (!guildId) return text("The Crimson Hand only works inside the server, not in DMs.");

  const [config, divisions] = await Promise.all([
    getCouncilConfig(),
    getDivisionConfigs(guildId),
  ]);
  const ctx: Ctx = { interaction, member: interaction.member, guildId, config, divisions };

  // The anti-nuke gate (lib/discord/guard.ts): this server only, never while
  // the bot holds dangerous permissions, and no changes during a lockdown.
  const blocked = securityGate(SECURITY, interaction, config, accessOf(interaction));
  if (blocked) return text(blocked);

  if (!isMember(ctx.member, config, divisions)) {
    return text("You do not have clearance to use The Crimson Hand.");
  }

  if (interaction.type === InteractionType.MessageComponent) return handleComponent(ctx);
  if (interaction.type === InteractionType.ModalSubmit) return handleModal(ctx);
  if (interaction.type !== InteractionType.ApplicationCommand) {
    return text("Unsupported interaction.");
  }

  const { path, opts } = route(interaction.data?.options);
  switch (interaction.data?.name ?? "") {
    case "points":
      return handlePoints(ctx, path, opts);
    case "leaderboard":
      return handleLeaderboard(ctx, opts);
    case "promote":
      return handlePromote(ctx, path, opts);
    case "division":
      return handleDivision(ctx, path, opts);
    case "shift":
      return handleShift(ctx, path, opts);
    case "announce":
      return handleAnnounce(ctx, opts);
    case "crimson":
      return handleCrimson(ctx, path, opts);
    case "security":
      return reply(
        await handleSecurity(SECURITY, interaction, config, path, {
          canEngage: isScarlet(ctx.member, config),
          reason: str(opts, "reason"),
        })
      );
    default:
      return text("Unknown command.");
  }
}
