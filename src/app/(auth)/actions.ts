"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { generateCodeword } from "@/lib/codeword";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  pruneAttempts,
  formatRetryAfter,
  INVITE_RULE,
} from "@/lib/rate-limit";
import { logAudit, clientIp, AUDIT_ACTIONS } from "@/lib/audit";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";

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

  // Invite codes are short and guessable at volume, so redemption attempts are
  // throttled per client IP. Checked before the lookup so a locked-out client
  // cannot keep probing the code space.
  const ip = await clientIp();
  await pruneAttempts();
  const limit = await checkRateLimit("invite", ip || "unknown", INVITE_RULE);
  if (limit.blocked) {
    return {
      ok: false,
      error: `TOO MANY INVALID CODES. TRY AGAIN IN ${formatRetryAfter(
        limit.retryAfterMs
      )}.`,
    };
  }

  const invite = await db.inviteCode.findUnique({
    where: { code: inviteCodeRaw },
  });

  const exhausted = !!invite && invite.useCount >= invite.maxUses;
  if (!invite || !invite.active || exhausted) {
    await recordAttempt("invite", ip || "unknown", ip);
    return { ok: false, error: "INVALID OR ALREADY-USED INVITE CODE." };
  }
  if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
    await recordAttempt("invite", ip || "unknown", ip);
    return { ok: false, error: "THIS INVITE CODE HAS EXPIRED." };
  }

  const email = `${username}@${EMAIL_DOMAIN}`;
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return { ok: false, error: "THAT EMAIL IS ALREADY REGISTERED." };
  }

  // Claim a use *before* creating the account. The `useCount` guard makes this
  // a compare-and-set: two registrations racing on the last remaining use will
  // see one update match zero rows, so a code can never be over-redeemed.
  const claimed = await db.inviteCode.updateMany({
    where: {
      id: invite.id,
      active: true,
      useCount: { lt: invite.maxUses },
    },
    data: { useCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    await recordAttempt("invite", ip || "unknown", ip);
    return { ok: false, error: "INVALID OR ALREADY-USED INVITE CODE." };
  }

  const password = generateCodeword();
  const passwordHash = await bcrypt.hash(password, 10);

  let user;
  try {
    user = await db.user.create({
      data: {
        email,
        passwordHash,
        clearance: 1,
      },
    });
  } catch (err) {
    // Release the claimed use so a failed registration doesn't burn it.
    await db.inviteCode.updateMany({
      where: { id: invite.id },
      data: { useCount: { decrement: 1 } },
    });
    throw err;
  }

  const nextCount = invite.useCount + 1;
  await db.inviteCode.update({
    where: { id: invite.id },
    data: {
      // Single-use codes keep populating `usedById`; multi-use codes record
      // only the first redeemer there, with the rest in `redemptions`.
      ...(invite.usedById ? {} : { usedById: user.id }),
      // Deactivate once every use is spent.
      ...(nextCount >= invite.maxUses ? { active: false } : {}),
    },
  });
  await db.inviteRedemption.create({
    data: { inviteId: invite.id, userId: user.id },
  });

  // A correct code clears the client's failed-attempt bucket.
  await clearAttempts("invite", ip || "unknown");

  await logAudit({
    action: AUDIT_ACTIONS.inviteRedeemed,
    actor: null,
    targetType: "invite",
    targetId: invite.id,
    targetName: invite.code,
    summary: `${email} registered with code ${invite.code} (${nextCount}/${invite.maxUses})`,
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
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const displayName = String(formData.get("displayName") ?? "").trim();
  // Generous upper bound because a name may carry redaction markup
  // ("Agent [*Vance*][4]"), which costs characters the reader never sees.
  if (displayName.length < 2 || displayName.length > 80) {
    return { ok: false, error: "NAME MUST BE 2-80 CHARACTERS." };
  }

  await db.user.update({
    where: { id: session.user.id },
    data: { displayName },
  });

  redirect("/personnel");
}
