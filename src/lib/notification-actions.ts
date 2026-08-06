"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { NOTIFICATION_TYPES, type NotificationType } from "@/lib/notifications";

// Fired when a single notification in the bell dropdown is clicked. Marking
// just that one keeps the rest visible/unread until the user opens them too.
export async function markNotificationReadAction(notificationId: string) {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { read: true },
  });
  // Layout scope: the unread badge is rendered in the shared shell, not a
  // single route.
  revalidatePath("/", "layout");
}

function isNotificationType(value: string): value is NotificationType {
  return (Object.values(NOTIFICATION_TYPES) as string[]).includes(value);
}

// Toggles MUTED for one notification type. Muted alerts still get logged
// (visible in the ALERTS history) but never bump the unread badge.
export async function toggleMuteAction(type: string) {
  if (!isNotificationType(type)) return;
  const user = await requireUser();
  const existing = await db.notificationPreference.findUnique({
    where: { userId_type: { userId: user.id, type } },
  });
  await db.notificationPreference.upsert({
    where: { userId_type: { userId: user.id, type } },
    create: { userId: user.id, type, muted: true },
    update: { muted: !(existing?.muted ?? false) },
  });
  revalidatePath("/settings");
}

// Toggles SILENCED for one notification type. Silenced alerts are never
// created at all — a permanent opt-out, until toggled back off.
export async function toggleSilentAction(type: string) {
  if (!isNotificationType(type)) return;
  const user = await requireUser();
  const existing = await db.notificationPreference.findUnique({
    where: { userId_type: { userId: user.id, type } },
  });
  await db.notificationPreference.upsert({
    where: { userId_type: { userId: user.id, type } },
    create: { userId: user.id, type, silenced: true },
    update: { silenced: !(existing?.silenced ?? false) },
  });
  revalidatePath("/settings");
}
