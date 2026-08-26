"use server";

import { revalidatePath } from "next/cache";
import { requireRootOwner } from "@/lib/session";
import {
  getSiteConfig,
  updateSiteConfig,
  type SiteConfig,
} from "@/lib/site-config";
import {
  OMEGA_OPS,
  OMEGA_REJECTED,
  CLEAR_ARMING,
  isOmegaOp,
  readOmegaCredentials,
  verifyOmega,
  canFire,
  armState,
  type OmegaOp,
} from "@/lib/omega";
import {
  activeMemetic,
  clampExposureSeconds,
  findAgent,
  findCadence,
  formatExposure,
  CLEAR_MEMETIC,
} from "@/lib/memetic";
import { db } from "@/lib/db";
import { purgeSite } from "@/lib/purge-site";
import { recordAttempt, clearAttempts } from "@/lib/rate-limit";
import { logAudit, logAuditNow, clientIp, AUDIT_ACTIONS } from "@/lib/audit";

export type OmegaState = { ok: boolean; error?: string; message?: string } | null;

// Every action here opens with requireRootOwner(), which is also where the
// SENTINEL challenge is enforced. Render-time gating is not a security boundary
// — an action is a POST endpoint reachable by anyone who can address it.

function readOp(formData: FormData): OmegaOp | null {
  const raw = String(formData.get("op") ?? "");
  return isOmegaOp(raw) ? raw : null;
}

// Shared front half of arm and fire: authorize, then verify all three factors.
// Fire re-runs this rather than trusting the arming as proof of a past check,
// so a stolen armed state is still worth nothing without the credentials.
async function authorize(
  formData: FormData,
  op: OmegaOp,
  stage: "arm" | "fire"
): Promise<{ ok: true; actor: Awaited<ReturnType<typeof requireRootOwner>> } | { ok: false; error: string }> {
  const actor = await requireRootOwner();
  const result = await verifyOmega(actor.id, readOmegaCredentials(formData), op);

  if (!result.ok) {
    // No further attempts are recorded against an already-spent bucket: the
    // lockout is a fixed window, and topping it up would extend it forever.
    if (!result.throttled) {
      await recordAttempt("omega", actor.id, await clientIp());
    }
    await logAudit({
      action: AUDIT_ACTIONS.omegaRejected,
      actor,
      targetType: "site",
      summary: result.throttled
        ? `OMEGA ${stage} refused for ${OMEGA_OPS[op].label} — throttled`
        : `OMEGA ${stage} refused for ${OMEGA_OPS[op].label}`,
    });
    return { ok: false, error: OMEGA_REJECTED };
  }

  await clearAttempts("omega", actor.id);
  return { ok: true, actor };
}

export async function armOmegaAction(
  _prev: OmegaState,
  formData: FormData
): Promise<OmegaState> {
  const op = readOp(formData);
  if (!op) return { ok: false, error: OMEGA_REJECTED };

  const auth = await authorize(formData, op, "arm");
  if (!auth.ok) return { ok: false, error: auth.error };

  await updateSiteConfig({
    omegaArmedOp: op,
    omegaArmedAt: new Date(),
    omegaArmedBy: auth.actor.id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.omegaArmed,
    actor: auth.actor,
    targetType: "site",
    summary: `Armed ${OMEGA_OPS[op].label}`,
  });

  revalidatePath("/admin/omega");
  return { ok: true, message: `${OMEGA_OPS[op].label} ARMED.` };
}

export async function abortOmegaAction(): Promise<void> {
  const actor = await requireRootOwner();
  const cfg = await getSiteConfig();
  const state = armState(cfg);

  await updateSiteConfig({ ...CLEAR_ARMING });

  if (state.armed) {
    await logAudit({
      action: AUDIT_ACTIONS.omegaAborted,
      actor,
      targetType: "site",
      summary: `Aborted ${OMEGA_OPS[state.op].label}`,
    });
  }

  revalidatePath("/admin/omega");
}

export async function fireOmegaAction(
  _prev: OmegaState,
  formData: FormData
): Promise<OmegaState> {
  const op = readOp(formData);
  if (!op) return { ok: false, error: OMEGA_REJECTED };

  const auth = await authorize(formData, op, "fire");
  if (!auth.ok) return { ok: false, error: auth.error };
  const { actor } = auth;

  // The arming window is checked server-side, against the row rather than
  // anything the client sent. A request that never rendered a countdown is
  // held to it exactly as one that did.
  const cfg: SiteConfig = await getSiteConfig();
  if (!canFire(cfg, op, actor.id)) {
    const state = armState(cfg);
    const reason = !state.armed
      ? "NOT ARMED — OR ARMING EXPIRED."
      : Date.now() < state.readyAt
        ? "ARMING DELAY HAS NOT ELAPSED."
        : "ARMING DOES NOT MATCH THIS OPERATION.";
    return { ok: false, error: reason };
  }

  if (op === "terminate") {
    await updateSiteConfig({
      shutdownMode: true,
      shutdownAt: new Date(),
      shutdownMessage: String(formData.get("shutdownMessage") ?? "")
        .trim()
        .slice(0, 300),
      ...CLEAR_ARMING,
    });
    await logAudit({
      action: AUDIT_ACTIONS.siteTerminated,
      actor,
      targetType: "site",
      summary: "Site terminated — network dark to all personnel",
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "NETWORK TERMINATED." };
  }

  // purge
  const { models, usersDeleted } = await purgeSite(actor.id);
  // Clear the arming only after the wipe succeeds, so a failure part-way
  // through does not silently disarm and leave the operator unsure what ran.
  await updateSiteConfig({ ...CLEAR_ARMING });

  // logAudit defers its write with after(), which would land the record in an
  // AuditLog table the purge has just emptied — or not at all. Written now,
  // and only after the purge, so the one surviving row is the purge itself.
  await logAuditNow(
    {
      action: AUDIT_ACTIONS.sitePurged,
      actor,
      targetType: "site",
      summary: `Purged ${models} models; ${usersDeleted} accounts destroyed`,
    },
    await clientIp()
  );

  revalidatePath("/", "layout");
  return {
    ok: true,
    message: `PURGE COMPLETE. ${usersDeleted} ACCOUNTS DESTROYED.`,
  };
}

// Lifting a termination needs the same three factors as raising one — the
// account is already proven, but the site's posture is not something a
// half-authenticated session should be able to flip either way.
export async function restoreSiteAction(
  _prev: OmegaState,
  formData: FormData
): Promise<OmegaState> {
  const actor = await requireRootOwner();
  const result = await verifyOmega(
    actor.id,
    readOmegaCredentials(formData),
    "terminate"
  );
  if (!result.ok) {
    if (!result.throttled) {
      await recordAttempt("omega", actor.id, await clientIp());
    }
    await logAudit({
      action: AUDIT_ACTIONS.omegaRejected,
      actor,
      targetType: "site",
      summary: "OMEGA restore refused",
    });
    return { ok: false, error: OMEGA_REJECTED };
  }

  await clearAttempts("omega", actor.id);
  await updateSiteConfig({
    shutdownMode: false,
    shutdownAt: null,
    shutdownMessage: "",
    ...CLEAR_ARMING,
  });

  await logAudit({
    action: AUDIT_ACTIONS.siteRestored,
    actor,
    targetType: "site",
    summary: "Site restored — network open to personnel",
  });

  revalidatePath("/", "layout");
  return { ok: true, message: "NETWORK RESTORED." };
}

// --- MEMETIC AGENT ----------------------------------------------------------
//
// Unlike the two operations above, an exposure is neither destructive nor
// irreversible — it ends on its own clock and RECALL kills it instantly — so it
// does not go through the arm/hold/fire ceremony or ask for the OMEGA key
// again. requireRootOwner(), which also enforces the SENTINEL challenge, is the
// gate, exactly as it is for abortOmegaAction.
//
// What it IS is the only control on this page pointed at a person, so all three
// of these hold: the target is chosen from a list rather than typed, the
// cadence is clamped to the catalogue in lib/memetic.ts (see the
// photosensitivity note there), and both verbs are audited by name.

export async function deployMemeticAction(
  _prev: OmegaState,
  formData: FormData
): Promise<OmegaState> {
  const actor = await requireRootOwner();

  const targetId = String(formData.get("targetId") ?? "");
  const agent = findAgent(String(formData.get("agent") ?? ""));
  const cadence = findCadence(String(formData.get("cadence") ?? ""));
  const seconds = clampExposureSeconds(formData.get("seconds"));

  if (!agent || !cadence) return { ok: false, error: "UNKNOWN AGENT PROFILE." };

  // Resolved from the database, not trusted from the form: the select is a
  // convenience, and this is the check that decides.
  const target = await db.user.findUnique({
    where: { id: targetId },
    select: { id: true, displayName: true, email: true, suspended: true },
  });
  if (!target) return { ok: false, error: "NO SUCH MEMBER ON ROSTER." };
  if (target.id === actor.id) {
    return { ok: false, error: "CANNOT DEPLOY AGAINST YOUR OWN TERMINAL." };
  }

  const targetName = target.displayName ?? target.email;
  const endsAt = new Date(Date.now() + seconds * 1000);

  await updateSiteConfig({
    memeticTargetId: target.id,
    memeticAgent: agent.slug,
    memeticCadence: cadence.slug,
    memeticEndsAt: endsAt,
    memeticIssuedById: actor.id,
  });

  await logAudit({
    action: AUDIT_ACTIONS.memeticDeployed,
    actor,
    targetType: "user",
    targetId: target.id,
    targetName,
    summary: `Deployed ${agent.label} against ${targetName} for ${formatExposure(
      seconds
    )} at ${cadence.label}`,
  });

  // The exposure reaches the target through /api/memetic within a poll, so
  // only this page's own readouts need refreshing.
  revalidatePath("/admin/omega");
  return {
    ok: true,
    message: `${agent.label} DEPLOYED AGAINST ${targetName.toUpperCase()} — ${formatExposure(
      seconds
    )}.`,
  };
}

export async function recallMemeticAction(): Promise<void> {
  const actor = await requireRootOwner();
  const cfg = await getSiteConfig();
  const live = activeMemetic(cfg);

  await updateSiteConfig({ ...CLEAR_MEMETIC });

  // Nothing was up: clearing a lapsed row is housekeeping, not an act worth a
  // line in the trail.
  if (live) {
    const target = await db.user.findUnique({
      where: { id: live.targetId },
      select: { displayName: true, email: true },
    });
    const targetName = target?.displayName ?? target?.email ?? live.targetId;
    await logAudit({
      action: AUDIT_ACTIONS.memeticRecalled,
      actor,
      targetType: "user",
      targetId: live.targetId,
      targetName,
      summary: `Recalled ${live.agent.label} from ${targetName} with ${Math.max(
        0,
        Math.round((live.endsAt - Date.now()) / 1000)
      )}s remaining`,
    });
  }

  revalidatePath("/admin/omega");
}
