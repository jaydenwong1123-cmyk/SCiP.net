"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRootOwner } from "@/lib/session";
import { updateSiteConfig } from "@/lib/site-config";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { purgeUser } from "@/lib/purge-user";
import { findNonAsciiFormField } from "@/lib/validation";
import { CI_MODE_LABELS, isCiMode } from "@/lib/ci/access";
import { abortSiege, forceRestoreSystem } from "@/lib/ci/siege-store";
import { createCiCode, revokeCiCode } from "@/lib/ci/code-store";
import { CI_CODE_LABELS, isCiCodeKind } from "@/lib/ci/codes";

// The owner's controls for the Chaos Insurgency siege. Strictly the seeded
// owner, like OMEGA: every action here re-checks requireRootOwner(), because a
// server action never renders the page that hid the panel. Same shape as the
// memetic controls — guard, write, audit.

const PATH = "/admin/insurgency";

function done() {
  revalidatePath(PATH);
  revalidatePath("/", "layout");
}

export async function setCiModeAction(formData: FormData) {
  const actor = await requireRootOwner();
  const mode = String(formData.get("mode") ?? "");
  if (!isCiMode(mode)) return;
  await updateSiteConfig({ ciMode: mode });
  await logAudit({
    action: AUDIT_ACTIONS.ciConfigChanged,
    actor,
    targetType: "site",
    targetName: "ciMode",
    summary: `Chaos Insurgency siege set to ${CI_MODE_LABELS[mode]}`,
  });
  done();
}

export async function setCiSwitchAction(formData: FormData) {
  const actor = await requireRootOwner();
  const which = String(formData.get("switch") ?? "");
  const on = formData.get("on") === "true";
  if (which !== "signup" && which !== "attacks") return;
  await updateSiteConfig(which === "signup" ? { ciSignupEnabled: on } : { ciAttacksEnabled: on });
  await logAudit({
    action: AUDIT_ACTIONS.ciConfigChanged,
    actor,
    targetType: "site",
    targetName: which === "signup" ? "ciSignupEnabled" : "ciAttacksEnabled",
    summary: `CI ${which === "signup" ? "signup" : "attacks"} ${on ? "enabled" : "disabled"}`,
  });
  done();
}

export async function abortSiegeAction() {
  const actor = await requireRootOwner();
  await abortSiege(actor);
  done();
}

export async function clearCooldownAction() {
  const actor = await requireRootOwner();
  await updateSiteConfig({ ciCooldownUntil: null });
  await logAudit({
    action: AUDIT_ACTIONS.ciConfigChanged,
    actor,
    targetType: "site",
    targetName: "ciCooldownUntil",
    summary: "Siege cooldown cleared",
  });
  done();
}

export async function clearDefacementAction() {
  const actor = await requireRootOwner();
  await updateSiteConfig({ ciDefacedUntil: null });
  await logAudit({
    action: AUDIT_ACTIONS.ciConfigChanged,
    actor,
    targetType: "site",
    targetName: "ciDefacedUntil",
    summary: "Siege defacement cleared",
  });
  done();
}

export async function forceRestoreAction(formData: FormData) {
  const actor = await requireRootOwner();
  await forceRestoreSystem(actor, String(formData.get("system") ?? ""));
  done();
}

export async function setEarlyAccessAction(formData: FormData) {
  const actor = await requireRootOwner();
  const userId = String(formData.get("userId") ?? "");
  const on = formData.get("on") === "true";
  if (!userId) return;
  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true, email: true, isInsurgent: true },
  });
  if (!target || target.isInsurgent) return;
  await db.user.update({ where: { id: userId }, data: { earlyAccess: on } });
  await logAudit({
    action: AUDIT_ACTIONS.ciEarlyAccessChanged,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: target.displayName ?? target.email,
    summary: on ? "Added to siege early access" : "Removed from siege early access",
  });
  done();
}

// Suspension and deletion are the only things that apply to a CI account.
// Scoped to isInsurgent so these cannot be pointed at a member.
export async function setCiSuspendedAction(formData: FormData) {
  const actor = await requireRootOwner();
  if (findNonAsciiFormField(formData)) return;
  const userId = String(formData.get("userId") ?? "");
  const suspend = formData.get("suspend") === "true";
  const target = await db.user.findFirst({ where: { id: userId, isInsurgent: true } });
  if (!target) return;
  await db.user.update({
    where: { id: userId },
    data: { suspended: suspend, suspendedReason: suspend ? "Chaos Insurgency access revoked" : null },
  });
  await logAudit({
    action: AUDIT_ACTIONS.suspensionSet,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: target.displayName ?? target.email,
    summary: suspend ? "Suspended CI account" : "Reinstated CI account",
  });
  done();
}

export async function deleteCiAccountAction(formData: FormData) {
  const actor = await requireRootOwner();
  const userId = String(formData.get("userId") ?? "");
  const target = await db.user.findFirst({ where: { id: userId, isInsurgent: true } });
  if (!target) return;
  await purgeUser(userId);
  await logAudit({
    action: AUDIT_ACTIONS.accountDeleted,
    actor,
    targetType: "user",
    targetId: userId,
    targetName: target.displayName ?? target.email,
    summary: `Deleted CI account ${target.email}`,
  });
  done();
}

// One-use codes: a key to create an account outside the member network, or to
// attack it.
export async function generateCiCodeAction(formData: FormData) {
  const actor = await requireRootOwner();
  const kind = String(formData.get("kind") ?? "");
  if (!isCiCodeKind(kind)) return;
  const code = await createCiCode(actor, kind);
  await logAudit({
    action: AUDIT_ACTIONS.ciCodeGenerated,
    actor,
    targetType: "ci_code",
    targetName: code,
    summary: `Generated one-use ${CI_CODE_LABELS[kind]}`,
  });
  revalidatePath(PATH);
}

export async function revokeCiCodeAction(formData: FormData) {
  const actor = await requireRootOwner();
  const revoked = await revokeCiCode(String(formData.get("id") ?? ""));
  if (!revoked) return;
  await logAudit({
    action: AUDIT_ACTIONS.ciCodeRevoked,
    actor,
    targetType: "ci_code",
    targetName: revoked.code,
    summary: `Revoked unused ${isCiCodeKind(revoked.kind) ? CI_CODE_LABELS[revoked.kind] : "code"}`,
  });
  revalidatePath(PATH);
}
