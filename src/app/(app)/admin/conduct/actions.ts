"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPowers } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  isSanctionLevel,
  SANCTION_LABELS,
  SANCTION_LEVELS,
  MIN_SANCTION_DAYS,
  MAX_SANCTION_DAYS,
} from "@/lib/hack/sanctions";

// Issuing and lifting terminal sanctions.
//
// requireAdminPowers() throughout, and that is a deliberate boundary rather
// than a convenience: /counter-intel can uncover who ran an intrusion, but it
// cannot punish them. See the header of lib/counter-intel.ts for the argument.
// If a sanction ever becomes issuable from the desk, that separation is gone.

type ActionState = { ok: boolean; error?: string } | null;

export async function issueSanctionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminPowers();
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const userId = String(formData.get("userId") ?? "");
  const level = String(formData.get("level") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const daysRaw = String(formData.get("days") ?? "").trim();
  const indefinite = formData.get("indefinite") === "on";

  if (!userId) return { ok: false, error: "MISSING MEMBER." };
  if (!isSanctionLevel(level)) return { ok: false, error: "INVALID LEVEL." };
  // A sanction with no stated reason cannot be meaningfully appealed, and this
  // ladder is explicitly appealable — so the reason is required, not optional.
  if (!reason) {
    return { ok: false, error: "A REASON IS REQUIRED — THE MEMBER IS SHOWN IT." };
  }

  const subject = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, email: true, isOwner: true },
  });
  if (!subject) return { ok: false, error: "MEMBER NOT FOUND." };
  // The seeded owner is not sanctionable. Same reasoning as everywhere else
  // that exempts them: locking the root account out of a subsystem is a way to
  // lock the site's operator out of their own site.
  if (subject.isOwner) {
    return { ok: false, error: "THE OVERSEER OF RECORD CANNOT BE SANCTIONED." };
  }
  if (subject.id === actor.id) {
    return { ok: false, error: "YOU CANNOT SANCTION YOURSELF." };
  }

  // Indefinite is permitted only at the top rung, and only when asked for
  // explicitly. A warning or a restriction with no end date would be a
  // permanent penalty wearing a temporary label.
  const permanent = indefinite && level === SANCTION_LEVELS.blacklisted;
  let expiresAt: Date | null = null;
  if (!permanent) {
    const days = parseInt(daysRaw, 10);
    if (
      !Number.isInteger(days) ||
      days < MIN_SANCTION_DAYS ||
      days > MAX_SANCTION_DAYS
    ) {
      return {
        ok: false,
        error: `DURATION MUST BE ${MIN_SANCTION_DAYS}-${MAX_SANCTION_DAYS} DAYS.`,
      };
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  await db.hackSanction.create({
    data: {
      userId,
      level,
      reason: reason.slice(0, 400),
      expiresAt,
      issuedById: actor.id,
    },
  });

  // The member is TOLD. That is what makes this different from the conduct
  // flag, and what makes the appeal queue in lib/tickets.ts usable.
  await createNotification({
    userId,
    type: NOTIFICATION_TYPES.infraction,
    body: `${SANCTION_LABELS[level]} — ${reason.slice(0, 160)}`,
    link: "/hack",
  });

  await logAudit({
    action: AUDIT_ACTIONS.hackSanctionIssued,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: subject.displayName ?? subject.email,
    summary: `${SANCTION_LABELS[level]} issued to ${
      subject.displayName ?? subject.email
    }${permanent ? " (indefinite)" : ` until ${expiresAt!.toISOString().slice(0, 10)}`} — ${reason.slice(0, 200)}`,
  });

  revalidatePath("/admin/conduct");
  revalidatePath("/hack");
  return { ok: true };
}

export async function liftSanctionAction(
  _prevState: ActionState,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireAdminPowers();
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const id = String(formData.get("sanctionId") ?? "");
  const reason = String(formData.get("liftReason") ?? "").trim();
  if (!id) return { ok: false, error: "MISSING SANCTION." };

  const sanction = await db.hackSanction.findUnique({
    where: { id },
    include: { user: { select: { id: true, displayName: true, email: true } } },
  });
  if (!sanction) return { ok: false, error: "SANCTION NOT FOUND." };
  if (sanction.liftedAt) return { ok: false, error: "ALREADY LIFTED." };

  // Conditional on liftedAt so two admins acting on the same appeal lift it
  // once rather than racing to overwrite each other's reason.
  const { count } = await db.hackSanction.updateMany({
    where: { id, liftedAt: null },
    data: {
      liftedAt: new Date(),
      liftedById: actor.id,
      liftReason: reason.slice(0, 400),
    },
  });
  if (count !== 1) return { ok: false, error: "ALREADY LIFTED." };

  await createNotification({
    userId: sanction.userId,
    type: NOTIFICATION_TYPES.infraction,
    body: `TERMINAL SANCTION LIFTED${reason ? ` — ${reason.slice(0, 160)}` : "."}`,
    link: "/hack",
  });

  await logAudit({
    action: AUDIT_ACTIONS.hackSanctionLifted,
    actor,
    targetType: "user",
    targetId: sanction.userId,
    targetName: sanction.user.displayName ?? sanction.user.email,
    summary: `Lifted ${
      SANCTION_LABELS[
        isSanctionLevel(sanction.level) ? sanction.level : SANCTION_LEVELS.warning
      ]
    } on ${sanction.user.displayName ?? sanction.user.email}${
      reason ? ` — ${reason.slice(0, 200)}` : ""
    }`,
  });

  revalidatePath("/admin/conduct");
  revalidatePath("/hack");
  return { ok: true };
}
