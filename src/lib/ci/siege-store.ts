import { cache } from "react";
import { randomUUID } from "crypto";
import type { CiSiege, CiSiegeChallenge, CiSiegeSystem } from "@prisma/client";
import { db } from "@/lib/db";
import { getSiteConfig, updateSiteConfig } from "@/lib/site-config";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { createRng } from "@/lib/hack/rng";
import { drawGame, gameFor, generateChallenge, gradeAnswer } from "@/lib/hack/games";
import { DEADLINE_GRACE_MS, formatDuration } from "@/lib/hack/config";
import { recordConduct, CONDUCT_SURFACES } from "@/lib/hack/conduct";
import { RAISA_DEPARTMENT } from "@/lib/counter-intel";
import {
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  CI_LAUNCH_RULE,
  formatRetryAfter,
} from "@/lib/rate-limit";
import { ciEnabled, ciModeOf } from "./access";
import { claimCiCode, isLiveCiCode, releaseCiCode } from "./code-store";
import {
  CI_BAND,
  DEFACE_MS,
  LEAK_MS,
  LOCK_MS,
  RAISA_BAND,
  RESTORE_ONLINE_PCT,
  RESTORE_SOLVES,
  SIEGE_ROUND_MS,
  SIEGE_STATUS,
  SIEGE_STATUS_LABELS,
  type SiegePurpose,
  type SiegeSide,
} from "./config";
import { CI_SYSTEMS, isCiSystem, systemLabel, systemSpec } from "./systems";
import {
  cooldownState,
  drainAmount,
  hintSaysQuiet,
  isSiegeDue,
  isTooFast,
  isValidDuration,
  leakTierFor,
  lockHorizon,
  mainframeOpen,
  nextCooldown,
  outcomeFor,
} from "./siege";

// Server half of the Chaos Insurgency siege. The rules live in siege.ts; this
// file reads rows, applies those rules, and writes the outcome.
//
// THERE IS NO SCHEDULER. A siege ends when somebody next looks at it — the
// overlay's poll, the portal, the defense desk, any submit — through
// settleSiegeIfDue(), which claims the siege atomically so its effects fire
// exactly once however many requests arrive together.

const LIVE = "live";

type Actor = { id: string; displayName: string | null; email: string };

export type SiegeWithSystems = CiSiege & { systems: CiSiegeSystem[] };

// ---------------------------------------------------------------------------
// Public projections — the only shapes that cross the wire.
// ---------------------------------------------------------------------------

export type PublicSystem = {
  id: string;
  label: string;
  code: string;
  integrity: number;
  max: number;
  fallen: boolean;
  lockedUntil: number | null;
  restoreProgress: number;
};

export type PublicSiege = {
  id: string;
  status: string;
  statusLabel: string;
  startedAt: number;
  endsAt: number;
  mainframeOpen: boolean;
  systems: PublicSystem[];
};

export type PublicSiegeChallenge = {
  nonce: string;
  system: string;
  systemLabel: string;
  purpose: string;
  game: string;
  label: string;
  brief: string;
  payload: unknown;
  attemptsLeft: number;
  deadlineAt: number;
};

function orderSystems(systems: CiSiegeSystem[]): CiSiegeSystem[] {
  const order = CI_SYSTEMS.map((s) => s.id as string);
  return [...systems].sort((a, b) => order.indexOf(a.system) - order.indexOf(b.system));
}

export function publicSystem(row: CiSiegeSystem): PublicSystem {
  const spec = systemSpec(row.system);
  return {
    id: row.system,
    label: spec?.label ?? row.system.toUpperCase(),
    code: spec?.code ?? "",
    integrity: row.integrity,
    max: row.maxIntegrity,
    fallen: row.fallenAt !== null,
    lockedUntil: row.lockedUntil?.getTime() ?? null,
    restoreProgress: row.restoreProgress,
  };
}

export function publicSiege(siege: SiegeWithSystems): PublicSiege {
  return {
    id: siege.id,
    status: siege.status,
    statusLabel: SIEGE_STATUS_LABELS[siege.status] ?? siege.status.toUpperCase(),
    startedAt: siege.startedAt.getTime(),
    endsAt: siege.endsAt.getTime(),
    mainframeOpen: mainframeOpen(siege.systems),
    systems: orderSystems(siege.systems).map(publicSystem),
  };
}

// Exists so there is exactly one place to check that `solution` is not in it.
export function publicChallenge(ch: CiSiegeChallenge): PublicSiegeChallenge {
  const game = gameFor(ch.game);
  return {
    nonce: ch.nonce,
    system: ch.system,
    systemLabel: systemLabel(ch.system),
    purpose: ch.purpose,
    game: ch.game,
    label: game?.label ?? ch.game.toUpperCase(),
    brief: game?.brief ?? "",
    payload: JSON.parse(ch.payload) as unknown,
    attemptsLeft: ch.attemptsLeft,
    deadlineAt: ch.deadlineAt.getTime(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function findActiveSiege(): Promise<SiegeWithSystems | null> {
  return db.ciSiege.findFirst({
    where: { activeSlot: LIVE },
    include: { systems: true },
  });
}

export type SiegeSnapshot = {
  active: SiegeWithSystems | null;
  locked: CiSiegeSystem[];
  defacedUntil: Date | null;
};

/**
 * Everything the site needs to know about the siege right now, settling it
 * first if its time is up. Request-cached, and free when nothing is going on:
 * the hint columns on the (already cached) SiteConfig answer that alone.
 */
export const getSiegeSnapshot = cache(async (): Promise<SiegeSnapshot | null> => {
  const cfg = await getSiteConfig();
  const now = new Date();
  if (hintSaysQuiet(cfg, now)) return null;

  const active = await settleSiegeIfDue(now);
  const locked = await db.ciSiegeSystem.findMany({
    where: { lockedUntil: { gt: now } },
  });
  // Re-read rather than trusting the cached row: a settle a moment ago may
  // have just set the defacement.
  const fresh = await db.siteConfig.findUnique({
    where: { id: "singleton" },
    select: { ciDefacedUntil: true },
  });
  const defacedUntil =
    fresh?.ciDefacedUntil && fresh.ciDefacedUntil > now ? fresh.ciDefacedUntil : null;

  if (!active && locked.length === 0 && !defacedUntil) return null;
  return { active, locked, defacedUntil };
});

export async function getLockedSystemIds(now: Date): Promise<Set<string>> {
  const rows = await db.ciSiegeSystem.findMany({
    where: { lockedUntil: { gt: now } },
    select: { system: true },
  });
  return new Set(rows.map((r) => r.system));
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

async function recomputeLockHorizon(now: Date): Promise<Date | null> {
  const rows = await db.ciSiegeSystem.findMany({
    where: { lockedUntil: { gt: now } },
    select: { lockedUntil: true },
  });
  return lockHorizon(rows);
}

/**
 * Settle the live siege if it is due. Returns the siege if it is still live,
 * otherwise null.
 */
export async function settleSiegeIfDue(now: Date): Promise<SiegeWithSystems | null> {
  const siege = await findActiveSiege();
  if (!siege) {
    // The hint says a siege is on but none is — left behind by a crash between
    // the claim and the config write. Clear it so the hot path goes quiet.
    const cfg = await getSiteConfig();
    if (cfg.ciSiegeEndsAt !== null) await updateSiteConfig({ ciSiegeEndsAt: null });
    return null;
  }
  if (!isSiegeDue(siege, siege.systems, now)) return siege;

  const status = outcomeFor(siege.systems);
  const won = status === SIEGE_STATUS.ciWon;
  const defacedUntil = won ? new Date(now.getTime() + DEFACE_MS) : null;

  const claim = await db.ciSiege.updateMany({
    where: { id: siege.id, activeSlot: LIVE },
    data: { status, resolvedAt: now, activeSlot: null, defacedUntil },
  });
  // Somebody else's request got there first and is running the effects.
  if (claim.count !== 1) return null;

  if (won) {
    // Locks were provisional during the siege; they now run from the real end.
    await db.ciSiegeSystem.updateMany({
      where: { siegeId: siege.id, fallenAt: { not: null } },
      data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
    });
  }

  await updateSiteConfig({
    ciSiegeEndsAt: null,
    ciCooldownUntil: nextCooldown(now),
    ...(defacedUntil ? { ciDefacedUntil: defacedUntil } : {}),
    ciLockHorizon: await recomputeLockHorizon(now),
  });

  const fallen = siege.systems.filter((s) => s.fallenAt !== null).map((s) => systemLabel(s.system));
  let leakNote = "";
  if (won) {
    const tier = leakTierFor(siege.systems);
    if (tier > 0) leakNote = await issueLeak(siege.id, tier, now);
  }

  await logAudit({
    action: AUDIT_ACTIONS.ciSiegeResolved,
    actor: null,
    targetType: "ci_siege",
    targetId: siege.id,
    targetName: SIEGE_STATUS_LABELS[status],
    summary: won
      ? `Siege ended — CI breached ${fallen.join(", ")}.${leakNote}`
      : "Siege ended — RAISA held the perimeter.",
  });

  await notifyRaisa(
    won
      ? `SIEGE OVER — NETWORK BREACHED. OFFLINE: ${fallen.join(", ")}. RESTORE AT THE DESK.`
      : "SIEGE OVER — PERIMETER HELD. ALL SYSTEMS NOMINAL."
  );
  return null;
}

// Pick the file CI gets to see. Walks down from the earned tier, never below
// L-2 — an L-1 file is not a leak, everyone can read it.
async function issueLeak(siegeId: string, tier: number, now: Date): Promise<string> {
  for (let t = tier; t >= 2; t--) {
    const count = await db.scpFile.count({ where: { clearanceRequired: t } });
    if (count === 0) continue;
    const [file] = await db.scpFile.findMany({
      where: { clearanceRequired: t },
      select: { id: true, title: true },
      skip: Math.floor(Math.random() * count),
      take: 1,
    });
    if (!file) continue;
    await db.ciLeak.create({
      data: {
        siegeId,
        scpFileId: file.id,
        tier: t,
        expiresAt: new Date(now.getTime() + LEAK_MS),
      },
    });
    await logAudit({
      action: AUDIT_ACTIONS.ciLeakIssued,
      actor: null,
      targetType: "scp",
      targetId: file.id,
      targetName: file.title,
      summary: `"${file.title}" (L-${t}) exposed to Chaos Insurgency for ${formatDuration(LEAK_MS)}`,
    });
    return ` Leaked "${file.title}" (L-${t}).`;
  }
  return "";
}

// RAISA officers who can currently see the siege — the whole department in
// both early access and live (see ciVisibleTo), so only "off" stays silent.
async function notifyRaisa(body: string): Promise<void> {
  const cfg = await getSiteConfig();
  if (!ciEnabled(cfg)) return;
  const officers = await db.user.findMany({
    where: {
      department: RAISA_DEPARTMENT,
      suspended: false,
      isInsurgent: false,
    },
    select: { id: true },
  });
  await Promise.all(
    officers.map((o) =>
      createNotification({
        userId: o.id,
        type: NOTIFICATION_TYPES.siege,
        body,
        link: "/counter-intel/siege",
      })
    )
  );
}

// ---------------------------------------------------------------------------
// Launch and abort
// ---------------------------------------------------------------------------

export type LaunchResult = { ok: true; siegeId: string } | { ok: false; error: string };

const LAUNCH_REJECTED = "LAUNCH CODE REJECTED — INVALID OR ALREADY USED.";

export async function launchSiege(
  user: Actor,
  code: string,
  minutes: number
): Promise<LaunchResult> {
  const cfg = await getSiteConfig();
  if (!ciEnabled(cfg)) return { ok: false, error: "UPLINK OFFLINE." };

  const limit = await checkRateLimit("ci-launch", user.id, CI_LAUNCH_RULE);
  if (limit.blocked) {
    return {
      ok: false,
      error: `TOO MANY REJECTED CODES. RETRY IN ${formatRetryAfter(limit.retryAfterMs)}.`,
    };
  }
  if (!(await isLiveCiCode("launch", code))) {
    await recordAttempt("ci-launch", user.id);
    return { ok: false, error: LAUNCH_REJECTED };
  }
  await clearAttempts("ci-launch", user.id);

  if (!cfg.ciAttacksEnabled) {
    return { ok: false, error: "[OOC] ATTACKS ARE CURRENTLY DISABLED BY STAFF." };
  }

  const now = new Date();
  if (await settleSiegeIfDue(now)) {
    return { ok: false, error: "A SIEGE IS ALREADY IN PROGRESS." };
  }
  const cooldown = cooldownState(cfg, now);
  if (!cooldown.ready) {
    return {
      ok: false,
      error: `THE NETWORK IS ON ALERT. NEXT WINDOW IN ${formatDuration(cooldown.retryAfterMs)}.`,
    };
  }
  if (!isValidDuration(minutes)) return { ok: false, error: "INVALID SIEGE LENGTH." };

  // Every refusal above leaves the code unspent, so a launch turned away for
  // a cooldown can be retried with the same code. It is spent only here, once
  // nothing else stands in the way, and handed back if the siege fails to start.
  const operative = user.displayName ?? user.email;
  if (!(await claimCiCode("launch", code, { id: user.id, name: operative }))) {
    return { ok: false, error: LAUNCH_REJECTED };
  }

  const endsAt = new Date(now.getTime() + minutes * 60_000);
  let siege: CiSiege;
  try {
    siege = await db.ciSiege.create({
      data: {
        activeSlot: LIVE,
        launchedById: user.id,
        launchedByName: operative,
        startedAt: now,
        endsAt,
        systems: {
          create: CI_SYSTEMS.map((s) => ({
            system: s.id,
            integrity: s.max,
            maxIntegrity: s.max,
          })),
        },
      },
    });
  } catch (err) {
    await releaseCiCode("launch", code);
    if ((err as { code?: string }).code === "P2002") {
      return { ok: false, error: "A SIEGE IS ALREADY IN PROGRESS." };
    }
    throw err;
  }

  await updateSiteConfig({ ciSiegeEndsAt: endsAt });

  await logAudit({
    action: AUDIT_ACTIONS.ciSiegeLaunched,
    actor: user,
    targetType: "ci_siege",
    targetId: siege.id,
    targetName: `${minutes} MIN`,
    summary: `Chaos Insurgency siege launched for ${minutes} minutes with code ${code.trim().toUpperCase()}`,
  });
  await notifyRaisa(
    `⚠ NETWORK UNDER ATTACK — CHAOS INSURGENCY SIEGE IN PROGRESS. ${minutes} MIN. DEFEND NOW.`
  );
  return { ok: true, siegeId: siege.id };
}

// Staff kill switch. No defacement, no locks, no leak — an aborted siege
// leaves the network exactly as it was, except for the cooldown.
export async function abortSiege(actor: Actor): Promise<{ ok: boolean; error?: string }> {
  const siege = await findActiveSiege();
  if (!siege) return { ok: false, error: "NO SIEGE IN PROGRESS." };
  const now = new Date();

  const claim = await db.ciSiege.updateMany({
    where: { id: siege.id, activeSlot: LIVE },
    data: {
      status: SIEGE_STATUS.aborted,
      resolvedAt: now,
      activeSlot: null,
      abortedById: actor.id,
    },
  });
  if (claim.count !== 1) return { ok: false, error: "NO SIEGE IN PROGRESS." };

  await db.ciSiegeSystem.updateMany({
    where: { siegeId: siege.id },
    data: { lockedUntil: null },
  });
  await updateSiteConfig({
    ciSiegeEndsAt: null,
    ciCooldownUntil: nextCooldown(now),
    ciLockHorizon: await recomputeLockHorizon(now),
  });
  await logAudit({
    action: AUDIT_ACTIONS.ciSiegeAborted,
    actor,
    targetType: "ci_siege",
    targetId: siege.id,
    targetName: SIEGE_STATUS_LABELS[SIEGE_STATUS.aborted],
    summary: "Chaos Insurgency siege aborted by staff",
  });
  return { ok: true };
}

// Staff force-restore of a locked system, e.g. to undo a bad playtest.
export async function forceRestoreSystem(
  actor: Actor,
  systemId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isCiSystem(systemId)) return { ok: false, error: "UNKNOWN SYSTEM." };
  const now = new Date();
  const { count } = await db.ciSiegeSystem.updateMany({
    where: { system: systemId, lockedUntil: { gt: now } },
    data: { lockedUntil: now, restoredAt: now, restoredById: actor.id },
  });
  if (count === 0) return { ok: false, error: "THAT SYSTEM IS NOT LOCKED." };
  await updateSiteConfig({ ciLockHorizon: await recomputeLockHorizon(now) });
  await logAudit({
    action: AUDIT_ACTIONS.ciSystemRestored,
    actor,
    targetType: "ci_system",
    targetId: systemId,
    targetName: systemLabel(systemId),
    summary: `${systemLabel(systemId)} force-restored by staff`,
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Puzzles
// ---------------------------------------------------------------------------

export type IssueResult =
  | { ok: true; challenge: PublicSiegeChallenge }
  | { ok: false; error: string };

async function openChallengeFor(userId: string, now: Date) {
  return db.ciSiegeChallenge.findFirst({
    where: { userId, answeredAt: null, deadlineAt: { gt: now } },
    orderBy: { issuedAt: "desc" },
  });
}

/**
 * Deal the next puzzle against (or for) one system.
 *
 * Idempotent: a player with a puzzle still open gets that one back, whichever
 * system they asked for — there is no re-roll by refreshing or by switching
 * targets. abandonChallenge() is the honest way out.
 */
export async function issueSiegeChallenge(
  user: Actor,
  side: SiegeSide,
  systemId: string,
  purpose: SiegePurpose
): Promise<IssueResult> {
  if (!isCiSystem(systemId)) return { ok: false, error: "UNKNOWN SYSTEM." };
  const now = new Date();

  const open = await openChallengeFor(user.id, now);
  if (open) return { ok: true, challenge: publicChallenge(open) };

  let siegeId: string;
  let band: number;

  if (purpose === "siege") {
    const siege = await settleSiegeIfDue(now);
    if (!siege) return { ok: false, error: "NO SIEGE IN PROGRESS." };
    const row = siege.systems.find((s) => s.system === systemId);
    if (!row) return { ok: false, error: "UNKNOWN SYSTEM." };
    if (side === "ci") {
      if (row.fallenAt) return { ok: false, error: `${systemLabel(systemId)} IS ALREADY DOWN.` };
      if (systemId === "mainframe" && !mainframeOpen(siege.systems)) {
        return { ok: false, error: "THE MAINFRAME IS SEALED. TAKE DOWN TWO SYSTEMS FIRST." };
      }
    } else if (row.integrity >= row.maxIntegrity) {
      return { ok: false, error: `${systemLabel(systemId)} IS AT FULL INTEGRITY.` };
    }
    siegeId = siege.id;
    band = side === "ci" ? CI_BAND : RAISA_BAND;
  } else {
    // Post-siege restore: RAISA only, against a lock left by a settled siege.
    if (side !== "raisa") return { ok: false, error: "NOT PERMITTED." };
    const row = await db.ciSiegeSystem.findFirst({
      where: { system: systemId, lockedUntil: { gt: now }, siege: { activeSlot: null } },
    });
    if (!row) return { ok: false, error: `${systemLabel(systemId)} IS NOT LOCKED.` };
    siegeId = row.siegeId;
    band = RAISA_BAND;
  }

  const previous = await db.ciSiegeChallenge.findMany({
    where: { siegeId, userId: user.id },
    orderBy: { seq: "desc" },
    take: 3,
    select: { seq: true, game: true },
  });
  const seq = (previous[0]?.seq ?? 0) + 1;
  const rng = createRng();
  const gameId = drawGame(band, previous.map((p) => p.game), rng);
  const game = gameFor(gameId)!;
  const generated = generateChallenge(gameId, band, rng);

  try {
    const created = await db.ciSiegeChallenge.create({
      data: {
        siegeId,
        system: systemId,
        userId: user.id,
        userName: user.displayName ?? user.email,
        side,
        purpose,
        seq,
        game: gameId,
        band,
        nonce: randomUUID(),
        payload: JSON.stringify(generated.payload),
        solution: JSON.stringify(generated.solution),
        attemptsLeft: generated.attempts,
        issuedAt: now,
        deadlineAt: new Date(now.getTime() + Math.round(SIEGE_ROUND_MS * game.timeFactor)),
      },
    });
    return { ok: true, challenge: publicChallenge(created) };
  } catch (err) {
    // A second tab issued the same seq a moment ago — hand back its puzzle.
    if ((err as { code?: string }).code === "P2002") {
      const again = await openChallengeFor(user.id, now);
      if (again) return { ok: true, challenge: publicChallenge(again) };
    }
    throw err;
  }
}

export async function abandonChallenge(userId: string, nonce: string): Promise<void> {
  const ch = await db.ciSiegeChallenge.findFirst({ where: { nonce, userId, answeredAt: null } });
  if (!ch) return;
  // Walking away from a breach attempt costs what a wrong answer would.
  await settleAnswer(ch, false, new Date());
}

export type SubmitResult =
  | {
      ok: true;
      correct: boolean;
      settled: boolean;
      feedback?: string;
      attemptsLeft: number;
      delta: number;
      note?: string;
    }
  | { ok: false; error: string };

export async function submitSiegeAnswer(
  userId: string,
  nonce: string,
  answer: string,
  rawSignals: string
): Promise<SubmitResult> {
  if (answer.trim() === "") return { ok: false, error: "NO ANSWER ENTERED." };
  const ch = await db.ciSiegeChallenge.findFirst({ where: { nonce, userId } });
  if (!ch) return { ok: false, error: "NO SUCH PUZZLE." };
  if (ch.answeredAt) return { ok: false, error: "THAT PUZZLE IS ALREADY SETTLED." };

  const now = new Date();
  if (now.getTime() > ch.deadlineAt.getTime() + DEADLINE_GRACE_MS) {
    await db.ciSiegeChallenge.update({
      where: { id: ch.id },
      data: { answeredAt: now, correct: false },
    });
    return { ok: true, correct: false, settled: true, attemptsLeft: 0, delta: 0, note: "TIME EXPIRED." };
  }

  const graded = gradeAnswer(ch.game, JSON.parse(ch.solution) as unknown, answer);
  const attemptsLeft = Math.max(0, ch.attemptsLeft - 1);
  const settled = graded.correct || attemptsLeft === 0;

  if (!settled) {
    await db.ciSiegeChallenge.update({ where: { id: ch.id }, data: { attemptsLeft } });
    return { ok: true, correct: false, settled: false, feedback: graded.feedback, attemptsLeft, delta: 0 };
  }

  const elapsedMs = now.getTime() - ch.issuedAt.getTime();
  const game = gameFor(ch.game);
  const tooFast = graded.correct && isTooFast(elapsedMs, game?.minHumanMs ?? 0);

  void recordConduct({
    userId,
    surface: ch.side === "ci" ? CONDUCT_SURFACES.siegeCi : CONDUCT_SURFACES.siegeRaisa,
    runId: null,
    game: ch.game,
    elapsedMs,
    answer,
    correct: graded.correct,
    rawSignals,
  });

  const { delta, note } = await settleAnswer(ch, graded.correct, now, tooFast);
  return {
    ok: true,
    correct: graded.correct,
    settled: true,
    feedback: graded.feedback,
    attemptsLeft,
    delta,
    note,
  };
}

/**
 * Close one puzzle and apply its effect on the system. Every integrity change
 * is an atomic increment/decrement followed by a clamp, and every state change
 * (fall, back online, restored) is a conditional updateMany whose count says
 * whether THIS request made it — so racing submissions cannot double-fire one.
 */
async function settleAnswer(
  ch: CiSiegeChallenge,
  correct: boolean,
  now: Date,
  tooFast = false
): Promise<{ delta: number; note?: string }> {
  const side = ch.side as SiegeSide;
  let delta = 0;
  let note: string | undefined;

  if (ch.purpose === "restore") {
    if (correct && !tooFast) note = await applyRestoreSolve(ch, now);
  } else {
    const siege = await settleSiegeIfDue(now);
    if (!siege || siege.id !== ch.siegeId) {
      note = "THE SIEGE HAS ENDED.";
    } else if (tooFast) {
      note = "ANSWER REJECTED — FASTER THAN A HUMAN COULD READ IT. NO CREDIT.";
    } else {
      const row = siege.systems.find((s) => s.system === ch.system);
      if (row) {
        delta = drainAmount(side, correct);
        if (delta !== 0) note = await applyDelta(siege, row, delta, side, now);
      }
    }
  }

  await db.ciSiegeChallenge.update({
    where: { id: ch.id },
    data: { answeredAt: now, correct, delta, attemptsLeft: 0 },
  });
  return { delta, note };
}

async function applyDelta(
  siege: SiegeWithSystems,
  row: CiSiegeSystem,
  delta: number,
  side: SiegeSide,
  now: Date
): Promise<string | undefined> {
  await db.ciSiegeSystem.update({
    where: { id: row.id },
    data: { integrity: delta < 0 ? { decrement: -delta } : { increment: delta } },
  });
  await db.ciSiegeSystem.updateMany({
    where: { id: row.id, integrity: { lt: 0 } },
    data: { integrity: 0 },
  });
  await db.ciSiegeSystem.updateMany({
    where: { id: row.id, integrity: { gt: db.ciSiegeSystem.fields.maxIntegrity } },
    data: { integrity: row.maxIntegrity },
  });

  const label = systemLabel(row.system);

  if (side === "ci" && delta < 0) {
    const fell = await db.ciSiegeSystem.updateMany({
      where: { id: row.id, fallenAt: null, integrity: { lte: 0 } },
      data: { fallenAt: now, lockedUntil: new Date(siege.endsAt.getTime() + LOCK_MS) },
    });
    if (fell.count === 1) {
      await updateSiteConfig({ ciLockHorizon: await recomputeLockHorizon(now) });
      await logAudit({
        action: AUDIT_ACTIONS.ciSystemFallen,
        actor: null,
        targetType: "ci_system",
        targetId: row.system,
        targetName: label,
        summary: `${label} taken offline during siege`,
      });
      await notifyRaisa(`⚠ ${label} HAS FALLEN. RESTORE IT TO ${RESTORE_ONLINE_PCT}% TO BRING IT BACK.`);
      // Taking the last routed system ends the siege on the spot.
      await settleSiegeIfDue(now);
      return `${label} IS DOWN.`;
    }
  }

  if (side === "raisa" && delta > 0 && row.fallenAt) {
    const threshold = Math.ceil((row.maxIntegrity * RESTORE_ONLINE_PCT) / 100);
    const back = await db.ciSiegeSystem.updateMany({
      where: { id: row.id, fallenAt: { not: null }, integrity: { gte: threshold } },
      data: { fallenAt: null, lockedUntil: null },
    });
    if (back.count === 1) {
      await updateSiteConfig({ ciLockHorizon: await recomputeLockHorizon(now) });
      await logAudit({
        action: AUDIT_ACTIONS.ciSystemRestored,
        actor: null,
        targetType: "ci_system",
        targetId: row.system,
        targetName: label,
        summary: `${label} brought back online by RAISA mid-siege`,
      });
      return `${label} IS BACK ONLINE.`;
    }
  }
  return undefined;
}

async function applyRestoreSolve(ch: CiSiegeChallenge, now: Date): Promise<string> {
  const row = await db.ciSiegeSystem.findFirst({
    where: { siegeId: ch.siegeId, system: ch.system, lockedUntil: { gt: now } },
  });
  const label = systemLabel(ch.system);
  if (!row) return `${label} IS NO LONGER LOCKED.`;

  await db.ciSiegeSystem.update({
    where: { id: row.id },
    data: { restoreProgress: { increment: 1 } },
  });
  const done = await db.ciSiegeSystem.updateMany({
    where: { id: row.id, lockedUntil: { gt: now }, restoreProgress: { gte: RESTORE_SOLVES } },
    data: { lockedUntil: now, restoredAt: now, restoredById: ch.userId },
  });
  if (done.count === 1) {
    await updateSiteConfig({ ciLockHorizon: await recomputeLockHorizon(now) });
    await logAudit({
      action: AUDIT_ACTIONS.ciSystemRestored,
      actor: null,
      targetType: "ci_system",
      targetId: ch.system,
      targetName: label,
      summary: `${label} restored by RAISA (${ch.userName})`,
    });
    return `${label} RESTORED. SECTION BACK ONLINE.`;
  }
  return `RESTORE ${Math.min(row.restoreProgress + 1, RESTORE_SOLVES)}/${RESTORE_SOLVES}.`;
}

// ---------------------------------------------------------------------------
// Scoreboards and history
// ---------------------------------------------------------------------------

export type ScoreRow = { name: string; solves: number; total: number };

export async function siegeScoreboard(siegeId: string, side: SiegeSide): Promise<ScoreRow[]> {
  const rows = await db.ciSiegeChallenge.findMany({
    where: { siegeId, side, correct: true, delta: { not: 0 } },
    select: { userName: true, delta: true },
  });
  const byName = new Map<string, ScoreRow>();
  for (const r of rows) {
    const entry = byName.get(r.userName) ?? { name: r.userName, solves: 0, total: 0 };
    entry.solves += 1;
    entry.total += Math.abs(r.delta);
    byName.set(r.userName, entry);
  }
  return [...byName.values()].sort((a, b) => b.total - a.total);
}

export async function recentSieges(take = 10): Promise<SiegeWithSystems[]> {
  return db.ciSiege.findMany({
    orderBy: { startedAt: "desc" },
    take,
    include: { systems: true },
  });
}

// ---------------------------------------------------------------------------
// The feed — what the overlay, the portal and the desk all render from.
// ---------------------------------------------------------------------------

export type LockedSystem = {
  id: string;
  label: string;
  lockedUntil: number;
  restoreProgress: number;
  restoreNeeded: number;
};

export type SiegeFeed = {
  serverNow: number;
  earlyAccess: boolean;
  active: PublicSiege | null;
  locked: LockedSystem[];
  defacedUntil: number | null;
};

/**
 * The siege as one viewer is allowed to see it, or null when there is nothing
 * to show them. Visibility (ciMode, early access) is the caller's question:
 * pass `visible` from ciVisibleTo().
 */
export async function siegeFeed(visible: boolean): Promise<SiegeFeed | null> {
  if (!visible) return null;
  const cfg = await getSiteConfig();
  const snapshot = await getSiegeSnapshot();
  if (!snapshot) return null;
  return {
    serverNow: Date.now(),
    earlyAccess: ciModeOf(cfg) === "early",
    active: snapshot.active ? publicSiege(snapshot.active) : null,
    locked: orderSystems(snapshot.locked).map((row) => ({
      id: row.system,
      label: systemLabel(row.system),
      lockedUntil: row.lockedUntil!.getTime(),
      restoreProgress: row.restoreProgress,
      restoreNeeded: RESTORE_SOLVES,
    })),
    defacedUntil: snapshot.defacedUntil?.getTime() ?? null,
  };
}

// The live leak, if this CI operative earned a look at it: they launched the
// siege, or landed at least one breach during it.
export async function leakFor(userId: string, leakId?: string) {
  const now = new Date();
  const leak = await db.ciLeak.findFirst({
    where: { expiresAt: { gt: now }, ...(leakId ? { id: leakId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!leak) return null;
  const siege = await db.ciSiege.findUnique({
    where: { id: leak.siegeId },
    select: { launchedById: true },
  });
  if (siege?.launchedById === userId) return leak;
  const breaches = await db.ciSiegeChallenge.count({
    where: { siegeId: leak.siegeId, userId, side: "ci", correct: true, delta: { lt: 0 } },
  });
  return breaches > 0 ? leak : null;
}
