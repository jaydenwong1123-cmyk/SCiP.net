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

  if (!recipientId || !subject || !body) {
    return { ok: false, error: "RECIPIENT, SUBJECT, AND BODY ARE ALL REQUIRED." };
  }

  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient) {
    return { ok: false, error: "RECIPIENT NOT FOUND." };
  }

  await db.message.create({
    data: {
      senderId: user.id,
      recipientId,
      subject: subject.slice(0, 200),
      body: body.slice(0, 10000),
    },
  });

  revalidatePath("/messages");
  redirect("/messages");
}

export async function markReadAction(messageId: string) {
  const user = await requireUser();
  const message = await db.message.findUnique({ where: { id: messageId } });
  if (!message || message.recipientId !== user.id) return;

  await db.message.update({
    where: { id: messageId },
    data: { read: true },
  });
  revalidatePath("/messages");
}
