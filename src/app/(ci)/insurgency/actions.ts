"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireInsurgent } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { containsNonAscii, findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  consumeRateLimit,
  contentLimitError,
  CONTENT_RULE,
  CONTENT_SCOPES,
  SIEGE_RULE,
} from "@/lib/rate-limit";
import { ciEnabled } from "@/lib/ci/access";
import {
  abandonChallenge,
  issueSiegeChallenge,
  launchSiege,
  siegeFeed,
  submitSiegeAnswer,
  type LaunchResult,
  type SiegeFeed,
  type SubmitResult,
} from "@/lib/ci/siege-store";
import type { IssueState } from "@/components/ci/siege-console";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  CI_RANK_LABELS,
  canCommandSetRank,
  canCreateCiCodes,
  isCiRank,
  MAX_LIVE_CODES_PER_COMMANDER,
} from "@/lib/ci/ranks";
import { createCiCode, liveCiCodesBy, revokeCiCode } from "@/lib/ci/code-store";
import { CI_CODE_LABELS, isCiCodeKind } from "@/lib/ci/codes";

// The CI portal's actions. Each re-runs requireInsurgent(): a server action is
// its own request and never renders the layout that checked it.
//
// The puzzle actions take plain arguments rather than FormData for the same
// reason the training range's do — half the games build their answer by
// clicking, so the answer lives in React state, not a form field.

const OFFLINE = "UPLINK OFFLINE.";

export async function launchSiegeAction(
  _prev: LaunchResult | null,
  formData: FormData
): Promise<LaunchResult> {
  const user = await requireInsurgent();
  const code = String(formData.get("code") ?? "");
  const minutes = parseInt(String(formData.get("minutes") ?? ""), 10);
  if (containsNonAscii(code)) return { ok: false, error: NON_ASCII_ERROR };
  const result = await launchSiege(user, code, minutes);
  if (result.ok) revalidatePath("/insurgency");
  return result;
}

export async function issueAttackAction(system: string): Promise<IssueState> {
  const user = await requireInsurgent();
  if (!ciEnabled(await getSiteConfig())) return { ok: false, error: OFFLINE };
  if (containsNonAscii(system)) return { ok: false, error: NON_ASCII_ERROR };
  // The CI seat only ever attacks; "restore" is RAISA's.
  const issued = await issueSiegeChallenge(user, "ci", system, "siege");
  if (!issued.ok) return issued;
  return { ok: true, challenge: issued.challenge, serverNow: Date.now() };
}

export async function submitAttackAnswerAction(
  nonce: string,
  answer: string,
  signals: string
): Promise<SubmitResult> {
  const user = await requireInsurgent();
  if (containsNonAscii(answer) || containsNonAscii(signals)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }
  const limit = await consumeRateLimit("siege", user.id, SIEGE_RULE);
  if (limit.blocked) return { ok: false, error: contentLimitError(limit.retryAfterMs) };
  const result = await submitSiegeAnswer(user.id, nonce, answer, signals.slice(0, 400));
  if (!result.ok || !result.settled) return result;
  // The board after this answer, so the portal repaints without waiting for
  // the next poll. An operative always sees the siege while the event is on.
  return { ...result, feed: await siegeFeed(ciEnabled(await getSiteConfig())) };
}

export async function abandonAttackAction(nonce: string): Promise<SiegeFeed | null> {
  const user = await requireInsurgent();
  await abandonChallenge(user.id, nonce);
  return siegeFeed(ciEnabled(await getSiteConfig()));
}

// The operative's own dossier. Stored in User.personalFile, the same column the
// Foundation personnel file uses, but written and read only through this portal:
// the member profile and /personnel pages refuse CI accounts, and the member
// edit action refuses a CI subject. There is no subjectId here: an operative
// can edit their own file and nobody else's.
export async function updateDossierAction(
  _prev: { ok: boolean; error?: string } | null,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireInsurgent();
  if (findNonAsciiFormField(formData)) return { ok: false, error: NON_ASCII_ERROR };
  const limit = await consumeRateLimit(CONTENT_SCOPES.document, user.id, CONTENT_RULE);
  if (limit.blocked) return { ok: false, error: contentLimitError(limit.retryAfterMs) };

  const content = String(formData.get("dossier") ?? "").slice(0, 20000);
  await db.user.update({ where: { id: user.id }, data: { personalFile: content } });

  revalidatePath("/insurgency/dossier");
  return { ok: true };
}

// DELTA COMMAND's code desk. The same one-use codes the owner makes from
// /admin/insurgency, but a commander only ever sees and revokes the codes they
// made themselves, and holds at most MAX_LIVE_CODES_PER_COMMANDER unspent at
// once. Squadron Leaders and Operatives are refused here even if they post the
// form by hand.
export async function generateCommandCodeAction(formData: FormData) {
  const user = await requireInsurgent();
  if (!canCreateCiCodes(user)) return;
  if (!ciEnabled(await getSiteConfig())) return;
  const kind = String(formData.get("kind") ?? "");
  if (!isCiCodeKind(kind)) return;
  if ((await liveCiCodesBy(user.id)).length >= MAX_LIVE_CODES_PER_COMMANDER) return;
  const code = await createCiCode(user, kind);
  await logAudit({
    action: AUDIT_ACTIONS.ciCodeGenerated,
    actor: user,
    targetType: "ci_code",
    targetName: code,
    summary: `Delta Command generated one-use ${CI_CODE_LABELS[kind]}`,
  });
  revalidatePath("/insurgency");
}

export async function revokeCommandCodeAction(formData: FormData) {
  const user = await requireInsurgent();
  if (!canCreateCiCodes(user)) return;
  const revoked = await revokeCiCode(String(formData.get("id") ?? ""), user.id);
  if (!revoked) return;
  await logAudit({
    action: AUDIT_ACTIONS.ciCodeRevoked,
    actor: user,
    targetType: "ci_code",
    targetName: revoked.code,
    summary: `Delta Command revoked unused ${isCiCodeKind(revoked.kind) ? CI_CODE_LABELS[revoked.kind] : "code"}`,
  });
  revalidatePath("/insurgency");
}

// DELTA COMMAND promoting an Operative to Squadron Leader, or demoting one back.
// canCommandSetRank() keeps Delta Command itself owner-only, both ways.
export async function setSquadRankAction(formData: FormData) {
  const user = await requireInsurgent();
  const targetId = String(formData.get("userId") ?? "");
  const rank = String(formData.get("rank") ?? "");
  if (!isCiRank(rank)) return;
  const target = await db.user.findFirst({
    where: { id: targetId, isInsurgent: true, suspended: false },
    select: { id: true, displayName: true, email: true, ciRank: true },
  });
  if (!target || target.ciRank === rank || !canCommandSetRank(user, target, rank)) return;
  await db.user.update({ where: { id: target.id }, data: { ciRank: rank } });
  await logAudit({
    action: AUDIT_ACTIONS.ciRankChanged,
    actor: user,
    targetType: "user",
    targetId: target.id,
    targetName: target.displayName ?? target.email,
    summary: `Delta Command set CI rank to ${CI_RANK_LABELS[rank]}`,
  });
  revalidatePath("/insurgency/roster");
  revalidatePath(`/insurgency/roster/${target.id}`);
  revalidatePath("/admin/insurgency");
}
