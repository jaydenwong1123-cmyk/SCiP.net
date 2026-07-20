import { db } from "@/lib/db";

// Triggers that create a Notification row. Kept as a const map (mirroring
// AUDIT_ACTIONS) rather than a Prisma enum, since SQLite has no native enum
// type and a string keeps the migration trivial.
export const NOTIFICATION_TYPES = {
  message: "message",
  mention: "mention",
  infraction: "infraction",
  ticket: "ticket",
} as const;

export type NotificationType =
  (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  body: string;
  link: string;
}): Promise<void> {
  // Never notify yourself about your own action (e.g. self-mention).
  await db.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      body: input.body.slice(0, 300),
      link: input.link,
    },
  });
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
