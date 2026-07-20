"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

// Fired when the bell dropdown opens. Marks everything currently unread as
// read — there is no per-item "mark read" affordance, so this is the only
// write path.
export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  // Layout scope: the unread badge is rendered in the shared shell, not a
  // single route.
  revalidatePath("/", "layout");
}
