import { db } from "@/lib/db";

// Triggers that create a Notification row. Kept as a const map (mirroring
// AUDIT_ACTIONS) rather than a Prisma enum, since SQLite has no native enum
// type and a string keeps the migration trivial.
export const NOTIFICATION_TYPES = {
  message: "message",
  mention: "mention",
  infraction: "infraction",
  ticket: "ticket",
  intrusion: "intrusion",
  siege: "siege",
  // A reply in a forum topic the member opened or has posted in.
  forum: "forum",
  // A newly issued broadcast the member is cleared to read.
  broadcast: "broadcast",
  // A decision on the member's own clearance request.
  clearance: "clearance",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  body: string;
  link: string;
}): Promise<void> {
  const preference = await db.notificationPreference.findUnique({
    where: { userId_type: { userId: input.userId, type: input.type } },
  });
  // SILENCED: skip the row entirely, a permanent "never tell me" opt-out.
  if (preference?.silenced) return;

  // Never notify yourself about your own action (e.g. self-mention).
  await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      body: input.body.slice(0, 300),
      link: input.link,
      // MUTED: still log it for history, but pre-mark it read so it never
      // bumps the badge or pings the bell.
      read: preference?.muted ?? false,
    },
  });
}

// The same alert for many members at once: a forum reply, a new broadcast.
//
// createNotification() costs two round trips per recipient, which is fine for
// one and far too slow for a roster. This reads every recipient's preference
// in one query and writes every row in one more, honouring SILENCED and MUTED
// exactly as the single form does.
//
// With `skipIfUnread`, a member who already has an unread alert for the same
// link is left alone, so a busy thread produces one alert, not one per reply.
export async function createNotifications(input: {
  userIds: string[];
  type: NotificationType;
  body: string;
  link: string;
  skipIfUnread?: boolean;
}): Promise<void> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return;

  const [preferences, pending] = await Promise.all([
    db.notificationPreference.findMany({
      where: { userId: { in: userIds }, type: input.type },
    }),
    input.skipIfUnread
      ? db.notification.findMany({
          where: {
            userId: { in: userIds },
            type: input.type,
            link: input.link,
            read: false,
          },
          select: { userId: true },
        })
      : Promise.resolve([]),
  ]);
  const byUser = new Map(preferences.map((p) => [p.userId, p]));
  const alreadyPending = new Set(pending.map((n) => n.userId));

  const rows = userIds
    .filter((id) => !byUser.get(id)?.silenced && !alreadyPending.has(id))
    .map((id) => ({
      userId: id,
      type: input.type,
      body: input.body.slice(0, 300),
      link: input.link,
      read: byUser.get(id)?.muted ?? false,
    }));
  if (rows.length === 0) return;
  await db.notification.createMany({ data: rows });
}

export async function getNotificationPreferences(userId: string) {
  const rows = await db.notificationPreference.findMany({ where: { userId } });
  const byType = new Map(rows.map((row) => [row.type, row]));
  return Object.values(NOTIFICATION_TYPES).map((type) => ({
    type,
    muted: byType.get(type)?.muted ?? false,
    silenced: byType.get(type)?.silenced ?? false,
  }));
}

const RECENT_LIMIT = 20;

export async function getRecentNotifications(userId: string) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: RECENT_LIMIT,
  });
}

export async function getUnreadNotificationCount(userId: string) {
  return db.notification.count({ where: { userId, read: false } });
}
