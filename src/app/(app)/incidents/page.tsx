import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canCreateIncident } from "@/lib/doc-permissions";
import { db } from "@/lib/db";
import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";
import { SEVERITIES, severityColor } from "@/lib/incident";
import { SeverityBadge, SignalDot } from "@/components/signal-badge";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";
import { FilterRow, FilterSearch } from "@/components/filter-bar";
import {
  filterHref,
  hasActiveFilters,
  pickOption,
  pickRank,
  pickQuery,
  containsFilter,
} from "@/lib/filters";

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ severity?: string; level?: string; q?: string }>;
}) {
  const user = await requireUser();
  const {
    severity: severityParam,
    level: levelParam,
    q: qParam,
  } = await searchParams;

  const activeSeverity = pickOption(
    severityParam,
    SEVERITIES.map((s) => s.name)
  );
  const activeLevel = pickRank(levelParam, 1, user.clearance);
  const query = pickQuery(qParam);

  const reports = await db.incidentReport.findMany({
    where: {
      // The clearance ceiling is applied first and always. A level facet may
      // only narrow within it, never reach above it.
      clearanceRequired: activeLevel
        ? { equals: activeLevel }
        : { lte: user.clearance },
      ...(activeSeverity ? { severity: activeSeverity } : {}),
      // Title and location, not body — same reasoning as the SCP archive: both
      // of these are already displayed on this page, so searching them cannot
      // surface text the viewer could not otherwise see.
      ...(query
        ? {
            OR: [
              { title: containsFilter(query) },
              { location: containsFilter(query) },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });

  const readableLevels = CLEARANCE_LEVELS.filter((l) => l.rank <= user.clearance);

  const current = {
    severity: activeSeverity,
    level: activeLevel?.toString() ?? null,
    q: query,
  };
  const qs = (change: Record<string, string | null>) =>
    filterHref("/incidents", current, change);
  const filtered = hasActiveFilters(current);

  return (
    <>
      <StationHead code="SEC-04 // BREACH & INCIDENT LOG" title="INCIDENT REPORTS">
        <Readout label="On File" value={reports.length} />
        {canCreateIncident(user) && (
          <Link href="/incidents/new" className="term-button">
            + FILE REPORT
          </Link>
        )}
      </StationHead>

      <HudPanel code="01" title="QUERY" status="REGISTRY FILTER">
        <div className="space-y-2">
          <FilterRow
            label="SEVERITY"
            active={activeSeverity}
            options={SEVERITIES.map((s) => ({
              value: s.name,
              label: s.name.toUpperCase(),
              color: s.color,
            }))}
            hrefFor={(value) => qs({ severity: value })}
          />
          <FilterRow
            label="LEVEL"
            active={activeLevel?.toString() ?? null}
            options={readableLevels.map((l) => ({
              value: l.rank.toString(),
              label: l.label,
            }))}
            hrefFor={(value) => qs({ level: value })}
          />
          <FilterSearch
            action="/incidents"
            query={query}
            hidden={{
              severity: activeSeverity,
              level: activeLevel?.toString(),
            }}
            placeholder="SEARCH TITLE OR LOCATION..."
          />
        </div>
      </HudPanel>

      <HudPanel
        code="02"
        title="REPORT REGISTRY"
        status={`${reports.length} RECORD${reports.length === 1 ? "" : "S"}`}
      >
        <div className="hud-list">
          {reports.length === 0 && (
            <EmptyState glyph="⚠" title="No reports on file">
              <p className="text-xs">
                {filtered
                  ? "NO REPORTS MATCH THE CURRENT FILTER."
                  : "NOTHING HAS BEEN FILED AT OR BELOW YOUR CLEARANCE."}
              </p>
              {filtered ? (
                <Link
                  href="/incidents"
                  className="term-button term-button--sm mt-1"
                >
                  CLEAR FILTERS
                </Link>
              ) : (
                canCreateIncident(user) && (
                  <Link
                    href="/incidents/new"
                    className="term-button term-button--sm mt-1"
                  >
                    FILE THE FIRST REPORT
                  </Link>
                )
              )}
            </EmptyState>
          )}
          {reports.map((r) => (
            <Link
              key={r.id}
              href={`/incidents/${r.id}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
              // Severity as a left edge bar: the whole row carries the signal,
              // not just the badge at its far end.
              style={{
                borderLeft: `3px solid ${severityColor(r.severity)}`,
                paddingLeft: "0.6rem",
              }}
            >
              <span className="flex items-center gap-2 min-w-0 break-words">
                <SignalDot color={severityColor(r.severity)} />
                <span className="hud-recid">
                  IR-{String(r.id).slice(0, 4).toUpperCase()}
                </span>
                <span className="text-[var(--term-fg-bright)]">{r.title}</span>
                {r.revisionCount > 0 && (
                  <span className="hud-recid">REV {r.revisionCount}</span>
                )}
              </span>
              <span className="shrink-0 flex items-center gap-2">
                <SeverityBadge severity={r.severity} />
                <span className="hud-recid">
                  [{clearanceLabel(r.clearanceRequired)}] — {r.author.displayName}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
