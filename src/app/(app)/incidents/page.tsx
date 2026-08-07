import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canCreateIncident } from "@/lib/doc-permissions";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { severityColor } from "@/lib/incident";
import { SeverityBadge, SignalDot } from "@/components/signal-badge";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";

export default async function IncidentsPage() {
  const user = await requireUser();

  const reports = await db.incidentReport.findMany({
    where: { clearanceRequired: { lte: user.clearance } },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });

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

      <HudPanel
        code="01"
        title="REPORT REGISTRY"
        status={`${reports.length} RECORD${reports.length === 1 ? "" : "S"}`}
      >
        <div className="hud-list">
          {reports.length === 0 && (
            <EmptyState glyph="⚠" title="No reports on file">
              <p className="text-xs">
                NOTHING HAS BEEN FILED AT OR BELOW YOUR CLEARANCE.
              </p>
              {canCreateIncident(user) && (
                <Link
                  href="/incidents/new"
                  className="term-button term-button--sm mt-1"
                >
                  FILE THE FIRST REPORT
                </Link>
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
