"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { generateCodeword } from "@/lib/codeword";
import {
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  pruneAttempts,
  formatRetryAfter,
  CI_ENLIST_RULE,
} from "@/lib/rate-limit";
import { logAudit, clientIp, AUDIT_ACTIONS } from "@/lib/audit";
import { getSiteConfig } from "@/lib/site-config";
import { ciEnabled } from "@/lib/ci/access";
import { isLiveCiCode, claimCiCode, releaseCiCode, attributeCiCode } from "@/lib/ci/code-store";
import { CI_EMAIL_DOMAIN } from "@/lib/ci/accounts";

// Chaos Insurgency enlistment — the only way a CI account comes into being.
//
// Mirrors registerAction, with the invite code swapped for a one-use
// out-of-roleplay enlist code an owner generated on /admin/insurgency
// (lib/ci/code-store.ts). The account is created already named and flagged
// isInsurgent, which is what walls it off from the member network.

const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{1,30}$/i;
const REJECTED = "ENLIST CODE REJECTED — INVALID OR ALREADY USED.";

export type EnlistResult =
  | { ok: true; email: string; password: string; codename: string }
  | { ok: false; error: string };

export async function enlistAction(
  _prev: EnlistResult | null,
  formData: FormData
): Promise<EnlistResult> {
  const cfg = await getSiteConfig();
  if (!ciEnabled(cfg) || !cfg.ciSignupEnabled) {
    return { ok: false, error: "[OOC] CI SIGNUP IS CLOSED." };
  }

  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "");

  const ip = await clientIp();
  const bucket = ip || "unknown";
  await pruneAttempts();
  const limit = await checkRateLimit("ci-enlist", bucket, CI_ENLIST_RULE);
  if (limit.blocked) {
    return {
      ok: false,
      error: `TOO MANY REJECTED CODES. TRY AGAIN IN ${formatRetryAfter(limit.retryAfterMs)}.`,
    };
  }
  // The code is checked before the username so a bad name cannot be used to
  // probe the code without spending an attempt.
  if (!(await isLiveCiCode("signup", code))) {
    await recordAttempt("ci-enlist", bucket, ip);
    return { ok: false, error: REJECTED };
  }
  await clearAttempts("ci-enlist", bucket);

  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: "INVALID CODENAME. USE LETTERS/NUMBERS ONLY, 2-30 CHARS." };
  }

  const email = `${username}@${CI_EMAIL_DOMAIN}`;
  if (await db.user.findUnique({ where: { email } })) {
    return { ok: false, error: "THAT CODENAME IS ALREADY TAKEN." };
  }

  const password = generateCodeword();
  const codename = `CI-${username.toUpperCase()}`;

  // Spend the code before creating the account, so two people racing on the
  // same code cannot both enlist; give it back if the insert fails.
  if (!(await claimCiCode("signup", code, { id: "", name: codename }))) {
    return { ok: false, error: REJECTED };
  }
  let user;
  try {
    user = await db.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        clearance: 1,
        displayName: codename,
        isInsurgent: true,
      },
    });
  } catch (err) {
    await releaseCiCode("signup", code);
    throw err;
  }
  await attributeCiCode("signup", code, { id: user.id, name: codename });

  await logAudit({
    action: AUDIT_ACTIONS.ciEnlisted,
    actor: null,
    targetType: "user",
    targetId: user.id,
    targetName: codename,
    summary: `Chaos Insurgency account ${email} created with enlist code ${code.trim().toUpperCase()}`,
  });

  return { ok: true, email, password, codename };
}
