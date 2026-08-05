import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  anonymiseRun,
  canAccessCounterIntel,
  canDeleteCounterIntelLog,
  purgeExpiredCounterIntelLogs,
  COUNTER_INTEL_RETENTION_DAYS,
  REVEAL_MAX,
} from "@/lib/counter-intel";
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
  const scope = filter === "open" || filter === "identified" ? filter : "all";

  const where =
    scope === "open"
      ? { revealLevel: { lt: REVEAL_MAX } }
      : scope === "identified"
        ? { revealLevel: REVEAL_MAX }
        : {};

  const [rows, total] = await Promise.all([
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
        grant: {
          select: { id: true, tier: true, expiresAt: true, revokedAt: true },
        },
      },
    }),
    db.hackRun.count({ where }),
  ]);

  const cases = rows.map(anonymiseRun);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canDelete = canDeleteCounterIntelLog(user);

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
