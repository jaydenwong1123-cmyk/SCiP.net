import { db } from "@/lib/db";
import {
  addRole,
  createMessage,
  editMessage,
  removeRole,
} from "@/lib/discord/rest";
import { COLOR } from "@/lib/discord/types";
import type { EngineConfig } from "./config";
import { mention, promotionButtons, promotionEmbed, rungLabel } from "./embeds";
import { getMember } from "./points";
import { getLadder, positionOf, type Rung } from "./ranks";

// THE PROMOTION FLOW.
//
//   /promote request -> eligibility is checked HERE, not in the command
//   handler -> an embed with Approve/Deny lands in the review channel ->
//   High Command decides -> the bot performs the role swap and edits the
//   original embed in place.
//
// The decision, not the request, is what moves a role. The bot never promotes
// anyone on points alone, which is the entire reason the second step exists.

export type RequestOutcome =
  | { ok: true; requestId: string; to: Rung }
  | { ok: false; message: string };

/**
 * Open a promotion request.
 *
 * Every refusal below is a sentence the member can act on, and they are checked
 * in the order a member actually hits them, so the message they get is about
 * the first real obstacle rather than the last one in the function.
 */
export async function createRequest(
  config: EngineConfig,
  guildId: string,
  discordId: string,
  username: string
): Promise<RequestOutcome> {
  if (!config.reviewChannelId) {
    return {
      ok: false,
      message:
        "No review channel is configured, so a request would have nowhere to go. An owner needs to run /engine setup first.",
    };
  }

  const ladder = await getLadder(guildId);
  if (ladder.length === 0) {
    return {
      ok: false,
      message:
        "There is no rank ladder yet. An owner needs to add ranks with /engine rank add.",
    };
  }

  const pending = await db.enginePromotionRequest.findFirst({
    where: { guildId, discordId, status: "pending" },
  });
  if (pending) {
    return {
      ok: false,
      message:
        "You already have a promotion request awaiting review. High Command will get to it.",
    };
  }

  const member = await getMember(guildId, discordId);
  const points = member?.points ?? 0;
  const where = positionOf(ladder, points, member?.rankRoleId ?? null);

  if (!where.next) {
    return {
      ok: false,
      message: `You are at the top of the ladder (${rungLabel(where.current)}). There is nothing above it.`,
    };
  }
  if (!where.eligible) {
    return {
      ok: false,
      message: `**${where.next.label}** requires ${where.next.points} points. You have ${points} — ${where.shortfall} short.`,
    };
  }

  const request = await db.enginePromotionRequest.create({
    data: {
      guildId,
      discordId,
      username,
      fromRoleId: where.current?.roleId ?? null,
      toRoleId: where.next.roleId,
      toLabel: where.next.label,
      pointsAtRequest: points,
    },
  });

  const posted = await createMessage(config.reviewChannelId, {
    embeds: [
      promotionEmbed({
        requestId: request.id,
        discordId,
        username,
        from: where.current,
        to: where.next,
        points,
        status: "pending",
      }),
    ],
    components: promotionButtons(request.id),
  });

  if (!posted.ok) {
    // The row would otherwise sit "pending" forever behind an embed nobody can
    // see, blocking every future request this member makes.
    await db.enginePromotionRequest.delete({ where: { id: request.id } });
    return {
      ok: false,
      message: `Your request could not be posted to the review channel: ${posted.error}`,
    };
  }

  await db.enginePromotionRequest.update({
    where: { id: request.id },
    data: { messageId: posted.data?.id ?? null },
  });

  return { ok: true, requestId: request.id, to: where.next };
}

export type DecisionOutcome = { ok: boolean; message: string };

/**
 * Approve a request: grant the new role, strip the old one, record the rank.
 *
 * Order matters. The grant happens FIRST and the whole decision is abandoned if
 * it fails — the alternative is stripping someone of their existing rank and
 * only then discovering the bot cannot hand out the new one, which leaves them
 * worse off than before they asked. Removing the old role is best-effort by
 * comparison: briefly holding two rank roles is untidy, not broken.
 */
export async function approveRequest(
  config: EngineConfig,
  requestId: string,
  reviewerId: string
): Promise<DecisionOutcome> {
  const request = await db.enginePromotionRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, message: "That request no longer exists." };
  if (request.status !== "pending") {
    return { ok: false, message: `That request was already ${request.status}.` };
  }

  const granted = await addRole(
    request.guildId,
    request.discordId,
    request.toRoleId
  );
  if (!granted.ok) {
    return { ok: false, message: granted.error ?? "The role change failed." };
  }

  if (request.fromRoleId) {
    await removeRole(request.guildId, request.discordId, request.fromRoleId);
  }

  await db.enginePromotionRequest.update({
    where: { id: requestId },
    data: { status: "approved", reviewerId, decidedAt: new Date() },
  });

  await db.engineMember.upsert({
    where: {
      guildId_discordId: {
        guildId: request.guildId,
        discordId: request.discordId,
      },
    },
    create: {
      guildId: request.guildId,
      discordId: request.discordId,
      username: request.username,
      rankRoleId: request.toRoleId,
    },
    update: { rankRoleId: request.toRoleId },
  });

  if (config.announceChannelId) {
    await createMessage(config.announceChannelId, {
      embeds: [
        {
          title: "PROMOTION — EFFECTIVE IMMEDIATELY",
          description: `${mention(request.discordId)} has been advanced to **${request.toLabel}**.`,
          color: COLOR.approved,
          footer: { text: "By order of High Command" },
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  // No DM. The role landing on them IS the notification, and an approval that
  // arrives twice — once as a role and once as a message — is noise.
  return {
    ok: true,
    message: `Approved. ${request.username} is now **${request.toLabel}**.`,
  };
}

export async function denyRequest(
  requestId: string,
  reviewerId: string,
  reason: string
): Promise<DecisionOutcome> {
  const request = await db.enginePromotionRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { ok: false, message: "That request no longer exists." };
  if (request.status !== "pending") {
    return { ok: false, message: `That request was already ${request.status}.` };
  }

  await db.enginePromotionRequest.update({
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
 * Redraw a decided request in place, without its buttons.
 *
 * Used when the decision did not come from pressing the buttons — the
 * /promote approve command path, or a denial whose reason arrived by modal
 * after the original message had scrolled away.
 */
export async function refreshRequestMessage(
  config: EngineConfig,
  requestId: string
): Promise<void> {
  const request = await db.enginePromotionRequest.findUnique({
    where: { id: requestId },
  });
  if (!request?.messageId || !config.reviewChannelId) return;

  const ladder = await getLadder(request.guildId);
  const from = ladder.find((r) => r.roleId === request.fromRoleId) ?? null;
  // A rung deleted from the ladder since the request was made still has to
  // render, so fall back to what the request itself recorded.
  const to = ladder.find((r) => r.roleId === request.toRoleId) ?? {
    id: "",
    roleId: request.toRoleId,
    label: request.toLabel,
    points: request.pointsAtRequest,
  };

  await editMessage(config.reviewChannelId, request.messageId, {
    embeds: [
      promotionEmbed({
        requestId: request.id,
        discordId: request.discordId,
        username: request.username,
        from,
        to,
        points: request.pointsAtRequest,
        status: request.status as "approved" | "denied" | "cancelled",
        reviewerId: request.reviewerId,
        reason: request.reason,
      }),
    ],
    components: [],
  });
}

export async function pendingRequests(guildId: string, limit = 10) {
  return db.enginePromotionRequest.findMany({
    where: { guildId, status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
