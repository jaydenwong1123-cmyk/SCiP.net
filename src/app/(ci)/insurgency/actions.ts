"use server";

import { revalidatePath } from "next/cache";
import { requireInsurgent } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { containsNonAscii, NON_ASCII_ERROR } from "@/lib/validation";
import { consumeRateLimit, contentLimitError, SIEGE_RULE } from "@/lib/rate-limit";
import { ciEnabled } from "@/lib/ci/access";
import {
  abandonChallenge,
  issueSiegeChallenge,
  launchSiege,
  submitSiegeAnswer,
  type LaunchResult,
  type SubmitResult,
} from "@/lib/ci/siege-store";
import type { IssueState } from "@/components/ci/siege-console";

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
  return submitSiegeAnswer(user.id, nonce, answer, signals.slice(0, 400));
}

export async function abandonAttackAction(nonce: string): Promise<void> {
  const user = await requireInsurgent();
  await abandonChallenge(user.id, nonce);
}
