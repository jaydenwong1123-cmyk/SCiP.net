import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/lib/session";
import { db } from "@/lib/db";
import { NOT_INSURGENT } from "@/lib/ci/accounts";
import { recentDayKeys } from "@/lib/activity";
import { renderRedactedName } from "@/lib/redact";
import {
  StationHead,
  HudPanel,
  HudTable,
  Readout,
  EmptyState,
} from "@/components/hud";

export const metadata: Metadata = { title: "Activity Statistics" };

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;
const WEEKS = 6;

// ACTIVITY STATISTICS — owner and co-owner only.
//
// Everything here is counted from the site's own database: the ActivityDay
// rows written by recordVisit() (one per member per day they opened the site)
// and the creation dates of the records members make. No third-party analytics
// and nothing per-page; it answers "is the site busier than it was" and stops
// there.
//
// Individual members are named in exactly one place, the contributor table,
// and only by counts of things they posted publicly to the forums.
export default async function StatsPage() {
  const viewer = await requireOwner();
  const now = new Date();
  const days = recentDayKeys(TREND_DAYS, now);
  const weekStarts = Array.from(
    { length: WEEKS },
    (_, i) => new Date(now.getTime() - (WEEKS - i) * 7 * DAY_MS)
  );
  const since30 = new Date(now.getTime() - 30 * DAY_MS);

  const createdSince = { createdAt: { gte: weekStarts[0] } };
  const [
    members,
    everVisited,
    visits,
    forumPosts,
    scpFiles,
    incidents,
    broadcasts,
    joins,
    topPosters,
  ] = await Promise.all([
    db.user.count({ where: NOT_INSURGENT }),
    db.user.count({ where: { ...NOT_INSURGENT, lastSeenAt: { not: null } } }),
    db.activityDay.findMany({
      where: { day: { gte: days[0] } },
      select: { day: true, userId: true },
    }),
    db.forumPost.findMany({ where: createdSince, select: { createdAt: true } }),
    db.scpFile.findMany({ where: createdSince, select: { createdAt: true } }),
    db.incidentReport.findMany({ where: createdSince, select: { createdAt: true } }),
    db.broadcast.findMany({ where: createdSince, select: { createdAt: true } }),
    db.user.findMany({
      where: { ...NOT_INSURGENT, ...createdSince },
      select: { createdAt: true },
    }),
    db.forumPost.groupBy({
      by: ["authorId"],
      where: { createdAt: { gte: since30 }, authorId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { authorId: "desc" } },
      take: 10,
    }),
  ]);

  // Distinct members per day, and over the trailing 1 / 7 / 30 days.
  const perDay = new Map<string, Set<string>>(days.map((d) => [d, new Set()]));
  for (const v of visits) perDay.get(v.day)?.add(v.userId);
  const distinctOver = (count: number) => {
    const seen = new Set<string>();
    for (const d of days.slice(-count)) {
      for (const id of perDay.get(d) ?? []) seen.add(id);
    }
    return seen.size;
  };
  const today = distinctOver(1);
  const week = distinctOver(7);
  const month = distinctOver(TREND_DAYS);
  const peak = Math.max(1, ...days.map((d) => perDay.get(d)!.size));

  // Bucket a list of creation dates into the trailing weeks.
  const perWeek = (rows: { createdAt: Date }[]) =>
    weekStarts.map((start, i) => {
      const end = weekStarts[i + 1] ?? now;
      return rows.filter((r) => r.createdAt >= start && r.createdAt < end).length;
    });
  const weekly = [
    { label: "FORUM POSTS", counts: perWeek(forumPosts) },
    { label: "SCP FILES", counts: perWeek(scpFiles) },
    { label: "INCIDENT REPORTS", counts: perWeek(incidents) },
    { label: "BROADCASTS", counts: perWeek(broadcasts) },
    { label: "NEW MEMBERS", counts: perWeek(joins) },
  ];

  const posterNames = new Map(
    (
      await db.user.findMany({
        where: { id: { in: topPosters.map((p) => p.authorId!) } },
        select: { id: true, displayName: true },
      })
    ).map((u) => [u.id, u.displayName ?? ""])
  );

  const pct = (part: number) =>
    members === 0 ? "0%" : `${Math.round((part / members) * 100)}%`;

  return (
    <>
      <StationHead code="ADM // ACTIVITY" title="ACTIVITY STATISTICS">
        <Readout label="Members" value={members} />
        <Readout label="Active Today" value={today} tone={today > 0 ? "fg" : "dim"} />
        <Readout label="Active 7 Days" value={`${week} (${pct(week)})`} small />
        <Readout label="Active 30 Days" value={`${month} (${pct(month)})`} small />
        <Link href="/admin" className="term-link text-sm">
          [BACK TO ADMIN]
        </Link>
      </StationHead>

      <p className="text-[10px] text-[var(--term-fg-dim)]">
        COUNTED FROM THIS SITE&apos;S OWN RECORDS · A MEMBER IS ACTIVE ON A DAY
        THEY OPENED ANY PAGE · DAYS ARE UTC · VISIT TRACKING BEGAN WHEN THIS
        PAGE WAS ADDED, SO EARLIER DAYS READ ZERO
      </p>

      <HudPanel
        code="01"
        title="MEMBERS ACTIVE PER DAY"
        status={`LAST ${TREND_DAYS} DAYS · PEAK ${peak === 1 && month === 0 ? 0 : peak}`}
      >
        {month === 0 ? (
          <EmptyState title="No visits recorded yet">
            <p className="text-xs">THE FIRST DAY APPEARS AS SOON AS A MEMBER SIGNS IN.</p>
          </EmptyState>
        ) : (
          <div
            className="flex items-end gap-[2px] h-32"
            role="img"
            aria-label={`Members active per day over the last ${TREND_DAYS} days. Today ${today}, peak ${peak}.`}
          >
            {days.map((d) => {
              const n = perDay.get(d)!.size;
              return (
                <div
                  key={d}
                  title={`${d}: ${n} active`}
                  className="flex-1 min-w-0"
                  style={{
                    height: `${Math.max((n / peak) * 100, n > 0 ? 4 : 1)}%`,
                    background: n > 0 ? "var(--term-fg)" : "var(--term-fg-dim)",
                    opacity: n > 0 ? 0.85 : 0.25,
                  }}
                />
              );
            })}
          </div>
        )}
        <div className="flex justify-between hud-recid mt-1">
          <span>{days[0]}</span>
          <span>{days[days.length - 1]}</span>
        </div>
      </HudPanel>

      <HudPanel code="02" title="RECORDS CREATED PER WEEK" status={`LAST ${WEEKS} WEEKS`}>
        <HudTable>
          <thead>
            <tr>
              <th className="text-left">RECORD</th>
              {weekStarts.map((start, i) => (
                <th key={i} className="text-right">
                  {i === WEEKS - 1 ? "THIS WEEK" : start.toISOString().slice(5, 10)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekly.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                {row.counts.map((n, i) => (
                  <td
                    key={i}
                    className="text-right"
                    style={n === 0 ? { color: "var(--term-fg-dim)" } : undefined}
                  >
                    {n}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </HudTable>
        <p className="text-[10px] text-[var(--term-fg-dim)] mt-2">
          EACH COLUMN IS A 7-DAY SPAN STARTING ON THE DATE SHOWN. RECORDS SINCE
          DELETED ARE NOT COUNTED.
        </p>
      </HudPanel>

      <HudPanel code="03" title="RETENTION" status="ALL TIME">
        <div className="hud-fields">
          <Readout label="Have Signed In Since Tracking Began" value={`${everVisited} OF ${members}`} small />
          <Readout
            label="Not Seen Since Tracking Began"
            value={members - everVisited}
            tone={members - everVisited > 0 ? "amber" : "dim"}
            small
          />
          <Readout
            label="Seen This Month, Not This Week"
            value={month - week}
            tone={month - week > 0 ? "amber" : "dim"}
            small
          />
        </div>
      </HudPanel>

      <HudPanel code="04" title="TOP FORUM CONTRIBUTORS" status="LAST 30 DAYS">
        {topPosters.length === 0 ? (
          <EmptyState glyph="◈" title="No forum posts in the last 30 days" />
        ) : (
          <div className="hud-list">
            {topPosters.map((p, i) => (
              <Link
                key={p.authorId}
                href={`/personnel/${p.authorId}`}
                className="flex justify-between gap-4 text-sm term-row no-underline px-1"
              >
                <span>
                  <span className="hud-recid">{String(i + 1).padStart(2, "0")}</span>{" "}
                  {posterNames.has(p.authorId!)
                    ? renderRedactedName(posterNames.get(p.authorId!)!, viewer)
                    : "[DELETED ACCOUNT]"}
                </span>
                <span className="hud-recid">
                  {p._count._all} {p._count._all === 1 ? "POST" : "POSTS"}
                </span>
              </Link>
            ))}
          </div>
        )}
      </HudPanel>
    </>
  );
}
