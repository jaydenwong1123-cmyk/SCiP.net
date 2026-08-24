import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  anonymiseRun,
  canAccessCounterIntel,
  canDeleteCounterIntelLog,
  purgeExpiredCounterIntelLogs,
  caseCode,
  caseResolution,
  CASE_RESOLUTIONS,
  CASE_STATUSES,
  COUNTER_INTEL_RETENTION_DAYS,
  REVEAL_MAX,
  unclaimedWhere,
  claimTtlCutoff,
  slaTier,
  SLA_TIERS,
} from "@/lib/counter-intel";
import { RUN_STATUS } from "@/lib/hack/config";
import { duelsForRuns } from "@/lib/hack/duel";
import { CaseList } from "./case-list";
import { LiveIntrusions, type LiveCase } from "./live-intrusions";
import { StationHead, HudPanel, HudBanner, Readout, TickRule } from "@/components/hud";

const PAGE_SIZE = 40;
// How many live breaches the duel panel offers at once. There is never
// realistically more than a handful — a run lasts twenty minutes at the very
// most and members are on a 24h cooldown — so this is a guard rail, not a
// pagination scheme.
const LIVE_LIMIT = 10;

export default async function CounterIntelPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  const user = await requireUser();
  // notFound rather than redirect: a member who is not RAISA should not learn
  // that this section exists at all.
  if (!canAccessCounterIntel(user)) notFound();

  // Lazy retention sweep — see purgeExpiredCounterIntelLogs() for why there's
  // no cron doing this instead.
  await purgeExpiredCounterIntelLogs();

  const { page, filter } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const scope =
    filter === "inProgress" ||
    filter === "flagged" ||
    filter === "mine" ||
    filter === "unclaimed"
      ? filter
      : "all";

  const where =
    scope === "inProgress"
      ? { caseStatus: CASE_STATUSES.inProgress }
      : scope === "flagged"
        ? { flagged: true }
        : scope === "mine"
          // A lapsed claim is not mine any more, so the cutoff is part of the
          // filter rather than something the projection hides afterwards —
          // otherwise "my cases" would paginate over rows it then blanks.
          ? { claimedById: user.id, claimedAt: { gte: claimTtlCutoff() } }
          : scope === "unclaimed"
            ? { ...unclaimedWhere(), caseStatus: CASE_STATUSES.needsAction }
            : {};

  const grantSelect = {
    id: true,
    tier: true,
    expiresAt: true,
    revokedAt: true,
  } as const;

  const [rows, total, resolutionRows, liveRows] = await Promise.all([
    db.hackRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      // `user` is included ONLY so anonymiseRun can decide whether the name is
      // unlocked yet. Its output is the only thing that reaches JSX — passing
      // one of these rows straight into markup would ship the intruder's name
      // in the RSC payload regardless of what rendered.
      include: {
        user: { select: { id: true, displayName: true, email: true } },
        traceBy: { select: { id: true, displayName: true, email: true } },
        claimedBy: { select: { id: true, displayName: true, email: true } },
        grant: { select: grantSelect },
      },
    }),
    db.hackRun.count({ where }),
    // Unpaginated, desk-wide — powers the resolution summary bar rather than
    // any one page's list, so it always reflects the whole log regardless of
    // which filter or page is currently open.
    db.hackRun.findMany({
      select: {
        status: true,
        flagged: true,
        caseStatus: true,
        startedAt: true,
        claimedById: true,
        claimedAt: true,
        grant: { select: grantSelect },
      },
    }),
    // Breaches in progress, for the duel panel. Own runs are excluded HERE
    // rather than disabled in the UI: a RAISA officer who is also the intruder
    // must not be able to identify their own case code by spotting the row
    // that will not engage.
    db.hackRun.findMany({
      where: {
        status: RUN_STATUS.active,
        userId: { not: user.id },
        // A SIGNAL SPOOF charge (lib/hack/tools.ts) suppresses a run from THIS
        // board only, and only while it holds. The case file, the case list and
        // the audit trail are all untouched — what the intruder bought is a
        // window in which they cannot be ENGAGED, not a window in which the
        // intrusion did not happen. Evaluated at query time rather than swept,
        // like every other expiry in this codebase.
        OR: [{ spoofedUntil: null }, { spoofedUntil: { lte: new Date() } }],
      },
      select: { id: true, startedAt: true, clearedStages: true },
      orderBy: { startedAt: "desc" },
      take: LIVE_LIMIT,
    }),
  ]);

  const duels = await duelsForRuns(liveRows.map((r) => r.id));
  const liveCases: LiveCase[] = liveRows.map((run) => {
    const duel = duels.get(run.id);
    return {
      runId: run.id,
      code: caseCode(run.id),
      startedLabel: run.startedAt.toISOString().slice(11, 16) + " UTC",
      clearedStages: run.clearedStages,
      // A settled duel always ends the run, so anything still `active` here
      // with a duel on it has one that is genuinely still running.
      engagement:
        !duel || duel.winner !== null
          ? "none"
          : duel.defenderId === user.id
            ? "mine"
            : "other",
      engagedByName: duel?.defenderName ?? null,
    };
  });

  const cases = rows.map((row) => anonymiseRun(row));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canDelete = canDeleteCounterIntelLog(user);

  const resolutionCounts = resolutionRows.reduce(
    (counts, run) => {
      const resolution = caseResolution({
        status: run.status,
        grant: run.grant
          ? {
              expiresAtMs: run.grant.expiresAt.getTime(),
              revoked: run.grant.revokedAt !== null,
            }
          : null,
      });
      counts[resolution] = (counts[resolution] ?? 0) + 1;
      return counts;
    },
    {} as Partial<Record<ReturnType<typeof caseResolution>, number>>
  );

  const flaggedCount = resolutionRows.filter((run) => run.flagged).length;

  // eslint-disable-next-line react-hooks/purity -- server component; single read of wall-clock for SLA bucketing
  const now = Date.now();

  // Desk workload, computed over the same unpaginated sweep the resolution bar
  // uses so the counters describe the whole log rather than the open page.
  const workload = resolutionRows.reduce(
    (acc, run) => {
      const tier = slaTier(run, now);
      if (tier === null) return acc;
      acc.unclaimed += 1;
      if (tier === SLA_TIERS.overdue) acc.overdue += 1;
      else if (tier === SLA_TIERS.aging) acc.aging += 1;
      return acc;
    },
    { unclaimed: 0, aging: 0, overdue: 0 }
  );

  const myCases = resolutionRows.filter(
    (run) =>
      run.claimedById === user.id &&
      run.claimedAt !== null &&
      run.claimedAt.getTime() >= claimTtlCutoff(new Date(now)).getTime()
  ).length;

  const seg = (active: boolean) => `hud-seg${active ? " hud-seg--on" : ""}`;

  return (
    <>
      <StationHead code="RAISA // COUNTER-INTRUSION DESK" title="WATCH FLOOR">
        <Readout label="Cases" value={total} />
        <Readout
          label="Live"
          value={liveCases.length}
          tone={liveCases.length > 0 ? "red" : "dim"}
        />
        <Readout
          label="Flagged"
          value={flaggedCount}
          tone={flaggedCount > 0 ? "amber" : "dim"}
        />
        <Readout
          label="Unclaimed"
          value={workload.unclaimed}
          tone={workload.unclaimed > 0 ? "amber" : "dim"}
        />
        <Readout
          label="Overdue"
          value={workload.overdue}
          tone={workload.overdue > 0 ? "red" : "dim"}
        />
        <Readout label="Yours" value={myCases} small />
        <Readout label="Retention" value={`${COUNTER_INTEL_RETENTION_DAYS}D`} small />
      </StationHead>

      <HudBanner level="secret">
        RAISA EYES ONLY — SIGNALS ANONYMOUS UNTIL TRACED
      </HudBanner>

      {/* Watch floor: the live feed sits beside the standing counters so an
          officer sees what is happening now and what has accumulated in one
          glance, rather than scrolling between them. */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-[var(--term-gap)] items-start">
        <div className="flex flex-col gap-[var(--term-gap)] min-w-0">
          <LiveIntrusions cases={liveCases} />

          <HudPanel
            code="02"
            title="CASE QUEUE"
            status={`PAGE ${pageNum} / ${pages}`}
          >
            <div className="hud-segmented mb-3">
              <Link href="/counter-intel" className={seg(scope === "all")}>
                ALL
              </Link>
              <Link
                href="/counter-intel?filter=inProgress"
                className={seg(scope === "inProgress")}
              >
                IN PROGRESS
              </Link>
              <Link
                href="/counter-intel?filter=flagged"
                className={seg(scope === "flagged")}
              >
                FLAGGED
              </Link>
              <Link
                href="/counter-intel?filter=unclaimed"
                className={seg(scope === "unclaimed")}
              >
                UNCLAIMED{workload.unclaimed > 0 && ` (${workload.unclaimed})`}
              </Link>
              <Link
                href="/counter-intel?filter=mine"
                className={seg(scope === "mine")}
              >
                MINE{myCases > 0 && ` (${myCases})`}
              </Link>
            </div>

            {workload.overdue > 0 && scope !== "unclaimed" && (
              <p className="text-xs text-[var(--term-red)] mb-2">
                ▲ {workload.overdue} CASE(S) PAST THE ACTION WINDOW AND UNHELD.{" "}
                <Link href="/counter-intel?filter=unclaimed" className="term-link">
                  [REVIEW QUEUE]
                </Link>
              </p>
            )}

            <CaseList cases={cases} revealMax={REVEAL_MAX} canDelete={canDelete} />

            {pages > 1 && (
              <>
                <TickRule className="mt-3" />
                <div className="flex justify-between items-center text-xs pt-2">
                  {pageNum > 1 ? (
                    <Link
                      href={`/counter-intel?filter=${scope}&page=${pageNum - 1}`}
                      className="term-link"
                    >
                      [← NEWER]
                    </Link>
                  ) : (
                    <span />
                  )}
                  <span className="hud-recid">
                    PAGE {pageNum} / {pages}
                  </span>
                  {pageNum < pages ? (
                    <Link
                      href={`/counter-intel?filter=${scope}&page=${pageNum + 1}`}
                      className="term-link"
                    >
                      [OLDER →]
                    </Link>
                  ) : (
                    <span />
                  )}
                </div>
              </>
            )}
          </HudPanel>
        </div>

        <HudPanel
          code="03"
          title="RESOLUTION LOG"
          status="DESK-WIDE"
          className="xl:sticky xl:top-3"
        >
          <div className="grid grid-cols-2 xl:grid-cols-1 gap-x-4">
            <div className="py-1">
              <Readout
                label="Intrusions Active"
                value={resolutionCounts[CASE_RESOLUTIONS.active] ?? 0}
                tone="amber"
              />
            </div>
            <div className="py-1">
              <Readout
                label="Live Access"
                value={resolutionCounts[CASE_RESOLUTIONS.accessLive] ?? 0}
                tone="red"
              />
            </div>
            <TickRule className="col-span-2 xl:col-span-1 my-1" />
            <div className="py-1">
              <Readout
                label="Revoked"
                value={resolutionCounts[CASE_RESOLUTIONS.accessRevoked] ?? 0}
                tone="dim"
                small
              />
            </div>
            <div className="py-1">
              <Readout
                label="Expired"
                value={resolutionCounts[CASE_RESOLUTIONS.accessExpired] ?? 0}
                tone="dim"
                small
              />
            </div>
            <div className="py-1">
              <Readout
                label="Repelled"
                value={resolutionCounts[CASE_RESOLUTIONS.repelled] ?? 0}
                tone="dim"
                small
              />
            </div>
            <div className="py-1">
              <Readout label="Flagged" value={flaggedCount} tone="amber" small />
            </div>
          </div>

          <TickRule className="my-2" />
          <p className="text-[10px] text-[var(--term-fg-dim)] leading-snug">
            CASE FILES PURGE AUTOMATICALLY AFTER{" "}
            {COUNTER_INTEL_RETENTION_DAYS}D. L-R5 MAY DELETE CASES EARLY,
            INDIVIDUALLY OR IN BULK, OR WIPE THE ENTIRE DESK.
          </p>
        </HudPanel>
      </div>
    </>
  );
}
