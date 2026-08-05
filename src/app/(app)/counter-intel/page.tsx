import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  anonymiseRun,
  canAccessCounterIntel,
  canDeleteCounterIntelLog,
  purgeExpiredCounterIntelLogs,
  caseResolution,
  CASE_RESOLUTIONS,
  CASE_STATUSES,
  COUNTER_INTEL_RETENTION_DAYS,
  REVEAL_MAX,
} from "@/lib/counter-intel";
import { RUN_STATUS } from "@/lib/hack/config";
import { CaseList } from "./case-list";

const PAGE_SIZE = 40;

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
    filter === "open" ||
    filter === "identified" ||
    filter === "action" ||
    filter === "flagged"
      ? filter
      : "all";

  const now = new Date();
  const where =
    scope === "open"
      ? { revealLevel: { lt: REVEAL_MAX } }
      : scope === "identified"
        ? { revealLevel: REVEAL_MAX }
        : scope === "action"
          ? {
              status: RUN_STATUS.extracted,
              grant: { revokedAt: null, expiresAt: { gt: now } },
            }
          : scope === "flagged"
            ? {
                caseStatus: {
                  in: [CASE_STATUSES.inProgress, CASE_STATUSES.needsAction],
                },
              }
            : {};

  const grantSelect = {
    id: true,
    tier: true,
    expiresAt: true,
    revokedAt: true,
  } as const;

  const [rows, total, resolutionRows] = await Promise.all([
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
        grant: { select: grantSelect },
      },
    }),
    db.hackRun.count({ where }),
    // Unpaginated, desk-wide — powers the resolution summary bar rather than
    // any one page's list, so it always reflects the whole log regardless of
    // which filter or page is currently open.
    db.hackRun.findMany({
      select: { status: true, caseStatus: true, grant: { select: grantSelect } },
    }),
  ]);

  const cases = rows.map(anonymiseRun);
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

  const flaggedCount = resolutionRows.filter(
    (run) =>
      run.caseStatus === CASE_STATUSES.inProgress ||
      run.caseStatus === CASE_STATUSES.needsAction
  ).length;

  const chip = (active: boolean) =>
    `term-link text-xs${active ? " text-[var(--term-fg-bright)]" : ""}`;

  return (
    <div className="space-y-4">
      <div className="term-panel space-y-2">
        <h1 className="text-lg tracking-widest">:: COUNTER-INTRUSION DESK ::</h1>
        <p className="text-xs text-[var(--term-fg-dim)]">
          RAISA EYES ONLY. EACH SIGNAL IS ANONYMOUS UNTIL TRACED. COMPLETE A
          TRACE TO UNCOVER ONE FURTHER FIELD.
        </p>
        <p className="text-xs text-[var(--term-fg-dim)]">
          RETENTION {COUNTER_INTEL_RETENTION_DAYS}D — CASE FILES PURGE
          AUTOMATICALLY. L-R5 MAY DELETE CASES EARLY, INDIVIDUALLY OR IN
          BULK, OR WIPE THE ENTIRE DESK.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link href="/counter-intel" className={chip(scope === "all")}>
            [ALL]
          </Link>
          <Link href="/counter-intel?filter=open" className={chip(scope === "open")}>
            [UNIDENTIFIED]
          </Link>
          <Link
            href="/counter-intel?filter=identified"
            className={chip(scope === "identified")}
          >
            [IDENTIFIED]
          </Link>
          <Link
            href="/counter-intel?filter=action"
            className={chip(scope === "action")}
          >
            [LIVE ACCESS]
          </Link>
          <Link
            href="/counter-intel?filter=flagged"
            className={chip(scope === "flagged")}
          >
            [FLAGGED]
          </Link>
        </div>
      </div>

      <div className="term-panel space-y-2">
        <h2 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
          RESOLUTION LOG
        </h2>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          <span className="text-[var(--term-amber)]">
            INTRUSIONS ACTIVE {resolutionCounts[CASE_RESOLUTIONS.active] ?? 0}
          </span>
          <span className="text-[var(--term-red)]">
            LIVE ACCESS {resolutionCounts[CASE_RESOLUTIONS.accessLive] ?? 0}
          </span>
          <span className="text-[var(--term-fg-dim)]">
            REVOKED {resolutionCounts[CASE_RESOLUTIONS.accessRevoked] ?? 0}
          </span>
          <span className="text-[var(--term-fg-dim)]">
            EXPIRED {resolutionCounts[CASE_RESOLUTIONS.accessExpired] ?? 0}
          </span>
          <span className="text-[var(--term-fg-dim)]">
            REPELLED {resolutionCounts[CASE_RESOLUTIONS.repelled] ?? 0}
          </span>
          <span className="text-[var(--term-amber)]">
            FLAGGED {flaggedCount}
          </span>
        </div>
      </div>

      <CaseList cases={cases} revealMax={REVEAL_MAX} canDelete={canDelete} />

      {pages > 1 && (
        <div className="term-panel flex justify-between text-xs">
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
          <span className="text-[var(--term-fg-dim)]">
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
      )}
    </div>
  );
}
