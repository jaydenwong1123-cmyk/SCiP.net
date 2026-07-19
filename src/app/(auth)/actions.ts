"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { generateCodeword } from "@/lib/codeword";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

const EMAIL_DOMAIN = "foundation.scp";
const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{1,30}$/i;

export type RegisterResult =
  | { ok: true; email: string; password: string }
  | { ok: false; error: string };

export async function registerAction(
  _prevState: RegisterResult | null,
  formData: FormData
): Promise<RegisterResult> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const inviteCodeRaw = String(formData.get("inviteCode") ?? "").trim().toUpperCase();

  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error: "INVALID USERNAME. USE LETTERS/NUMBERS ONLY, 2-30 CHARS.",
    };
  }
  if (!inviteCodeRaw) {
    return { ok: false, error: "INVITE CODE REQUIRED." };
  }

  const invite = await db.inviteCode.findUnique({
    where: { code: inviteCodeRaw },
  });
  if (!invite || !invite.active || invite.usedById) {
    return { ok: false, error: "INVALID OR ALREADY-USED INVITE CODE." };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "THIS INVITE CODE HAS EXPIRED." };
  }

  const email = `${username}@${EMAIL_DOMAIN}`;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "THAT EMAIL IS ALREADY REGISTERED." };
  }

  const password = generateCodeword();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      clearance: 1,
    },
  });

  await db.inviteCode.update({
    where: { id: invite.id },
    data: { active: false, usedById: user.id },
  });

  return { ok: true, email, password };
}

export async function setNameAction(
  _prevState: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "NOT AUTHENTICATED." };
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length < 2 || displayName.length > 40) {
    return { ok: false, error: "NAME MUST BE 2-40 CHARACTERS." };
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { displayName },
  });

  redirect("/personnel");
}
