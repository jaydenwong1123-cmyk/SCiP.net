"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

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
