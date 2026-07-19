"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function sendMessageAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const recipientId = String(formData.get("recipientId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const replyToThread = String(formData.get("threadId") ?? "").trim();

  if (!recipientId || !subject || !body) {
    return { ok: false, error: "RECIPIENT, SUBJECT, AND BODY ARE ALL REQUIRED." };
  }

  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient) {
    return { ok: false, error: "RECIPIENT NOT FOUND." };
  }

  // Only continue an existing thread the sender actually took part in.
  let threadId: string | undefined;
  if (replyToThread) {
    const root = await db.message.findFirst({
      where: {
        OR: [{ id: replyToThread }, { threadId: replyToThread }],
        AND: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
      },
      select: { threadId: true, id: true },
    });
    if (root) threadId = root.threadId ?? root.id;
  }

  const created = await db.message.create({
    data: {
      senderId: user.id,
      recipientId,
      subject: subject.slice(0, 200),
      body: body.slice(0, 10000),
      threadId,
    },
  });

  // Thread-starting message: anchor the thread to its own id.
  if (!threadId) {
    await db.message.update({
      where: { id: created.id },
      data: { threadId: created.id },
    });
  }

  revalidatePath("/messages");
  redirect("/messages");
}
