"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { getRealUser } from "@/lib/session";
import {
  checkAnswer,
  issueSentinel,
  clearSentinel,
  sentinelConfigured,
} from "@/lib/sentinel";
import {
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  SENTINEL_RULE,
} from "@/lib/rate-limit";
import { logAudit, logAuditNow, clientIp, AUDIT_ACTIONS } from "@/lib/audit";

type State = { ok: boolean; error?: string } | null;

// One deliberately uninformative rejection for every failure mode. The person
// answering knows the phrase; anyone who doesn't gets no purchase on how close
// they were, or on whether the challenge is even armed.
const REJECTED = "RESPONSE REJECTED.";

export async function submitSentinelAction(
  _prevState: State,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await getRealUser();
  if (!user) redirect("/login");
  // The challenge belongs to the root owner alone; nobody else has anything to
  // answer here.
  if (!user.isOwner) redirect("/");
  if (!sentinelConfigured()) redirect("/");

  const status = await checkRateLimit("sentinel", user.id, SENTINEL_RULE);
  if (status.blocked) {
    await terminateSession(user, "Sentinel bucket exhausted");
  }

  const answer = String(formData.get("answer") ?? "");
  if (!checkAnswer(answer)) {
    await recordAttempt("sentinel", user.id, await clientIp());
    await logAudit({
      action: AUDIT_ACTIONS.sentinelFailed,
      actor: user,
      targetType: "auth",
      summary: `Incorrect sentinel response (${status.remaining - 1} left before lockout)`,
    });
    // The attempt just recorded was the last one in the bucket — end the
    // session now rather than letting them come back for a fresh page.
    if (status.remaining <= 1) {
      await terminateSession(user, "Sentinel bucket exhausted");
    }
    return { ok: false, error: REJECTED };
  }

  await clearAttempts("sentinel", user.id);
  await issueSentinel(user.id);
  await logAudit({
    action: AUDIT_ACTIONS.sentinelPassed,
    actor: user,
    targetType: "auth",
    summary: "Sentinel challenge cleared",
  });

  redirect("/");
}

// Five wrong answers means someone holds the owner's password but not their
// knowledge. Drop the session outright rather than merely pausing it, and log
// synchronously — `signOut` redirects, and an `after()` callback scheduled
// behind that redirect is not a trail worth betting on.
async function terminateSession(
  user: { id: string; displayName: string | null; email: string },
  reason: string
): Promise<never> {
  await clearSentinel();
  await logAuditNow({
    action: AUDIT_ACTIONS.sentinelLocked,
    actor: user,
    targetType: "auth",
    summary: `${reason} — session terminated`,
  });
  await signOut({ redirectTo: "/login" });
  // signOut throws its redirect; unreachable, but it keeps the return type
  // honest for callers.
  redirect("/login");
}
