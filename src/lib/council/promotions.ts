import { db } from "@/lib/db";
import { COLOR, type Embed } from "@/lib/discord/types";
import {
  reviewChannelFor,
  rest,
  type CouncilConfig,
  type DivisionConfigs,
} from "./config";
import { DIVISIONS, divisionLabel, isDivision, type DivisionKey } from "./divisions";
import {
  mention,
  panel,
  promotionButtons,
  promotionEmbed,
  rungLabel,
} from "./embeds";
import { ensureStanding } from "./points";
import { getLadders, nextStep, type CouncilRung } from "./ranks";

// THE PROMOTION FLOW, per division.
//
//   /promote request -> eligibility is checked against the member's OWN
//   division's ladder -> an embed lands in that division's review channel ->
//   that division's HR (or Scarlet / Hands) decides -> the bot swaps the roles.
//
// A request from the top of Judicial Enforcers or Legislators asks for the
// lowest Judicial HR rung instead; it is posted to, and decided by, Judicial,
// and approving it moves the member into Judicial with their points.

export type RequestOutcome =
  | { ok: true; requestId: string; to: CouncilRung; toDivision: DivisionKey }
  | { ok: false; message: string }
  | { ok: false; apply: CouncilRung };

export async function createRequest(
  divisions: DivisionConfigs,
  guildId: string,
  discordId: string,
  username: string,
  appliedFor?: string
): Promise<RequestOutcome> {
  const member = await db.councilMember.findUnique({
    where: { guildId_discordId: { guildId, discordId } },
  });
  const division = member?.division;
  if (!division || !isDivision(division)) {
    return {
      ok: false,
      message:
        "You have not been assigned to a division yet. Your division's HR assigns you with /division assign.",
    };
  }

  const ladders = await getLadders(guildId);
  if (ladders[division].length === 0) {
    return {
      ok: false,
      message: `${divisionLabel(division)} has no ranks yet. Hands of the O5 add them with /council rank add.`,
    };
  }

  const pending = await db.councilPromotionRequest.findFirst({
    where: { guildId, discordId, status: "pending" },
  });
  if (pending) {
    return {
      ok: false,
      message: "You already have a promotion request awaiting review.",
    };
  }

  const standing = await ensureStanding(guildId, discordId, division, username);
  const where = nextStep(ladders, division, standing.points, standing.rankRoleId);

  if (!where.next || !where.toDivision) {
    return {
      ok: false,
      message: `You are at the top of ${divisionLabel(division)} (${rungLabel(where.current)}). Anything above it is handpicked.`,
    };
  }
  if (!where.eligible) {
    return {
      ok: false,
      message: `**${where.next.label}** requires ${where.next.points} points. You have ${standing.points} in ${divisionLabel(division)}. That is ${where.shortfall} short.`,
    };
  }

  const channelId = reviewChannelFor(divisions, where.toDivision);
  if (!channelId) {
    return {
      ok: false,
      message: `${divisionLabel(where.toDivision)} has no review channel, so a request would have nowhere to go. Hands of the O5 set one with /council division.`,
    };
  }

  if (where.next.requiresApplication && where.next.applicationUrl) {
    if (!appliedFor) return { ok: false, apply: where.next };
    if (appliedFor !== where.next.roleId) {
      return {
        ok: false,
        message:
          "The ranks changed since you were sent the form, so nothing was filed. Run /promote request again.",
      };
    }
  }
  const applicationUrl =
    appliedFor && where.next.requiresApplication ? where.next.applicationUrl : "";

  const request = await db.councilPromotionRequest.create({
    data: {
      guildId,
      discordId,
      username,
      division,
      toDivision: where.toDivision,
      fromRoleId: where.current?.roleId ?? null,
      toRoleId: where.next.roleId,
      toLabel: where.next.label,
      pointsAtRequest: standing.points,
      application: applicationUrl,
      channelId,
    },
  });

  const posted = await rest.createMessage(channelId, {
    embeds: [
      promotionEmbed({
        requestId: request.id,
        discordId,
        username,
        division,
        toDivision: where.toDivision,
        from: where.current,
        to: where.next,
        points: standing.points,
        status: "pending",
        applicationUrl,
      }),
    ],
    components: promotionButtons(request.id),
  });

  if (!posted.ok) {
    await db.councilPromotionRequest.delete({ where: { id: request.id } });
    return {
      ok: false,
      message: `Your request could not be posted to the review channel: ${posted.error}`,
    };
  }

  await db.councilPromotionRequest.update({
    where: { id: request.id },
    data: { messageId: posted.data?.id ?? null },
  });

  return {
    ok: true,
    requestId: request.id,
    to: where.next,
    toDivision: where.toDivision,
  };
}

export type DecisionOutcome = { ok: boolean; message: string };

export async function getRequest(requestId: string) {
  return db.councilPromotionRequest.findUnique({ where: { id: requestId } });
}

/**
 * Approve: grant the new rank, strip the old one, record it.
 *
 * As in The Engine, the grant comes FIRST and a failure abandons the whole
 * decision, so nobody loses a rank to a promotion the bot could not complete.
 * Everything after it is best-effort tidying.
 */
export async function approveRequest(
  config: CouncilConfig,
  divisions: DivisionConfigs,
  requestId: string,
  reviewerId: string
): Promise<DecisionOutcome> {
  const request = await getRequest(requestId);
  if (!request) return { ok: false, message: "That request no longer exists." };
  if (request.status !== "pending") {
    return { ok: false, message: `That request was already ${request.status}.` };
  }
  if (!isDivision(request.division) || !isDivision(request.toDivision)) {
    return { ok: false, message: "That request names a division that no longer exists." };
  }
  const from = request.division;
  const to = request.toDivision;
  const { guildId, discordId } = request;

  const granted = await rest.addRole(guildId, discordId, request.toRoleId);
  if (!granted.ok) {
    return { ok: false, message: granted.error ?? "The role change failed." };
  }
  if (request.fromRoleId) {
    await rest.removeRole(guildId, discordId, request.fromRoleId);
  }

  const feedIn = from !== to;
  if (feedIn) {
    // Leaving the subdivision for its parent: swap the division roles too.
    const oldRole = divisions[from].divisionRoleId;
    const newRole = divisions[to].divisionRoleId;
    if (oldRole && oldRole !== newRole) {
      await rest.removeRole(guildId, discordId, oldRole);
    }
    if (newRole) await rest.addRole(guildId, discordId, newRole);
  }

  const now = new Date();
  const target = await ensureStanding(guildId, discordId, to, request.username);

  if (feedIn) {
    // Points carry over into the parent. Never downward: a member who already
    // had a larger Judicial balance keeps it.
    const source = await ensureStanding(guildId, discordId, from);
    const carried = Math.max(target.points, source.points);
    await db.$transaction([
      db.councilPromotionRequest.update({
        where: { id: requestId },
        data: { status: "approved", reviewerId, decidedAt: now },
      }),
      db.councilStanding.update({
        where: { id: target.id },
        data: { rankRoleId: request.toRoleId, points: carried },
      }),
      db.councilMember.update({
        where: { guildId_discordId: { guildId, discordId } },
        data: { division: to },
      }),
      db.councilPointEntry.create({
        data: {
          guildId,
          discordId,
          division: to,
          delta: carried - target.points,
          balance: carried,
          reason: `Carried over from ${DIVISIONS[from].label} on promotion`,
          actorId: reviewerId,
        },
      }),
    ]);
  } else {
    await db.$transaction([
      db.councilPromotionRequest.update({
        where: { id: requestId },
        data: { status: "approved", reviewerId, decidedAt: now },
      }),
      db.councilStanding.update({
        where: { id: target.id },
        data: { rankRoleId: request.toRoleId },
      }),
    ]);
  }

  if (config.announceChannelId) {
    const into = feedIn ? ` of ${divisionLabel(to)}` : "";
    await rest.createMessage(config.announceChannelId, {
      embeds: [
        panel(
          "Promotion",
          `${mention(discordId)} has been advanced to **${request.toLabel}**${into}, effective immediately.`,
          {
            color: COLOR.approved,
            footer: { text: `${divisionLabel(to)} · By order of ${DIVISIONS[DIVISIONS[to].parent].label} HR` },
            timestamp: now.toISOString(),
          }
        ),
      ],
    });
  }

  const moved = feedIn ? ` They are now in ${divisionLabel(to)}, and their points came with them.` : "";
  return {
    ok: true,
    message: `Approved. ${request.username} is now **${request.toLabel}**.${moved}`,
  };
}

export async function denyRequest(
  requestId: string,
  reviewerId: string,
  reason: string
): Promise<DecisionOutcome> {
  const request = await getRequest(requestId);
  if (!request) return { ok: false, message: "That request no longer exists." };
  if (request.status !== "pending") {
    return { ok: false, message: `That request was already ${request.status}.` };
  }
  await db.councilPromotionRequest.update({
    where: { id: requestId },
    data: {
      status: "denied",
      reviewerId,
      reason: reason.slice(0, 500),
      decidedAt: new Date(),
    },
  });
  return { ok: true, message: `Denied the request from ${request.username}.` };
}

/**
 * Withdraw a member's open request — used when they change division, since a
 * request to climb a ladder they have just left no longer means anything.
 */
export async function cancelPending(
  guildId: string,
  discordId: string,
  why: string
): Promise<void> {
  const open = await db.councilPromotionRequest.findMany({
    where: { guildId, discordId, status: "pending" },
  });
  for (const request of open) {
    await db.councilPromotionRequest.update({
      where: { id: request.id },
      data: { status: "cancelled", reason: why, decidedAt: new Date() },
    });
    await refreshRequestMessage(request.id);
  }
}

/** The embed for a request as it stands now, without buttons once decided. */
export async function renderRequest(requestId: string): Promise<Embed | null> {
  const request = await getRequest(requestId);
  if (!request || !isDivision(request.division) || !isDivision(request.toDivision)) {
    return null;
  }
  const ladders = await getLadders(request.guildId);
  const all = Object.values(ladders).flat();
  const from = all.find((r) => r.roleId === request.fromRoleId) ?? null;
  // A rung deleted since the request was made still has to render.
  const to = all.find((r) => r.roleId === request.toRoleId) ?? {
    id: "",
    division: request.toDivision,
    band: "",
    roleId: request.toRoleId,
    label: request.toLabel,
    points: request.pointsAtRequest,
    requiresApplication: !!request.application,
    applicationUrl: request.application,
  };

  return promotionEmbed({
    requestId: request.id,
    discordId: request.discordId,
    username: request.username,
    division: request.division,
    toDivision: request.toDivision,
    from,
    to,
    points: request.pointsAtRequest,
    status: request.status as "pending" | "approved" | "denied" | "cancelled",
    reviewerId: request.reviewerId,
    reason: request.reason,
    applicationUrl: request.application,
  });
}

/** Redraw a decided request's review message in place, without its buttons. */
export async function refreshRequestMessage(requestId: string): Promise<void> {
  const request = await getRequest(requestId);
  if (!request?.messageId || !request.channelId) return;
  const embed = await renderRequest(requestId);
  if (!embed) return;
  await rest.editMessage(request.channelId, request.messageId, {
    embeds: [embed],
    components: [],
  });
}

export async function pendingRequests(
  guildId: string,
  divisions: DivisionKey[],
  limit = 15
) {
  return db.councilPromotionRequest.findMany({
    where: { guildId, status: "pending", toDivision: { in: divisions } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
