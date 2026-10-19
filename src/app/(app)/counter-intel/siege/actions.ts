"use server";

import { requireUser } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { canAccessCounterIntel } from "@/lib/counter-intel";
import { containsNonAscii, NON_ASCII_ERROR } from "@/lib/validation";
import { consumeRateLimit, contentLimitError, SIEGE_RULE } from "@/lib/rate-limit";
import { ciVisibleTo } from "@/lib/ci/access";
import {
  abandonChallenge,
  issueSiegeChallenge,
  siegeFeed,
  submitSiegeAnswer,
  type SiegeFeed,
  type SubmitResult,
} from "@/lib/ci/siege-store";
import type { SiegePurpose } from "@/lib/ci/config";
import type { IssueState } from "@/components/ci/siege-console";

// RAISA's side of the siege. Re-guarded on every call — desk membership AND
// siege visibility, so nobody can play a siege while the feature is off.

const FORBIDDEN = "NOT CLEARED FOR SIEGE DEFENSE.";

async function requireDefender() {
  const user = await requireUser();
  const cfg = await getSiteConfig();
  if (!canAccessCounterIntel(user) || !ciVisibleTo(user, cfg)) return null;
  return user;
}

export async function issueDefenseAction(
  system: string,
  purpose: SiegePurpose
): Promise<IssueState> {
  const user = await requireDefender();
  if (!user) return { ok: false, error: FORBIDDEN };
  if (containsNonAscii(system)) return { ok: false, error: NON_ASCII_ERROR };
  const safePurpose: SiegePurpose = purpose === "restore" ? "restore" : "siege";
  const issued = await issueSiegeChallenge(user, "raisa", system, safePurpose);
  if (!issued.ok) return issued;
  return { ok: true, challenge: issued.challenge, serverNow: Date.now() };
}

// Every answer hands back the board as it now stands, so the desk repaints
// the moment the result lands instead of on the next poll. requireDefender
// already established visibility, hence `true`.
export async function submitDefenseAction(
  nonce: string,
  answer: string,
  signals: string
): Promise<SubmitResult> {
  const user = await requireDefender();
  if (!user) return { ok: false, error: FORBIDDEN };
  if (containsNonAscii(answer) || containsNonAscii(signals)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }
  const limit = await consumeRateLimit("siege", user.id, SIEGE_RULE);
  if (limit.blocked) return { ok: false, error: contentLimitError(limit.retryAfterMs) };
  const result = await submitSiegeAnswer(user.id, nonce, answer, signals.slice(0, 400));
  if (!result.ok || !result.settled) return result;
  return { ...result, feed: await siegeFeed(true) };
}

export async function abandonDefenseAction(nonce: string): Promise<SiegeFeed | null | undefined> {
  const user = await requireDefender();
  if (!user) return undefined;
  await abandonChallenge(user.id, nonce);
  return siegeFeed(true);
}
