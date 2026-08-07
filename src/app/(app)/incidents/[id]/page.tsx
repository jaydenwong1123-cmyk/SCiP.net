import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasStaffPowers, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { canEditIncident } from "@/lib/doc-permissions";
import { renderBody } from "@/lib/render-body";
import { SeverityBadge } from "@/components/signal-badge";
import { deleteIncidentReportAction } from "../actions";
import { severityColor } from "@/lib/incident";
import { StationHead, HudPanel, TickRule } from "@/components/hud";

export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.incidentReport.findUnique({
    where: { id },
    include: { author: { select: { displayName: true } } },
  });

  if (!report || report.clearanceRequired > user.clearance) notFound();

  const canManage = hasStaffPowers(user);
  const canEdit = canEditIncident(user, report);
  // Prior versions are Admin and above; the history page re-checks.
  const canViewHistory = hasAdminPowers(user);

  return (
    <>
      <StationHead
        code="SEC-04 // INCIDENT REPORT"
        title={report.title.toUpperCase()}
      >
        {canEdit && (
          <Link href={`/incidents/${report.id}/edit`} className="term-link text-sm">
            [AMEND]
          </Link>
        )}
        {canViewHistory && (
          <Link
            href={`/incidents/${report.id}/history`}
            className="term-link text-sm"
          >
            [HISTORY
            {report.revisionCount > 0 ? ` (${report.revisionCount})` : ""}]
          </Link>
        )}
        <Link href="/incidents" className="term-link text-sm">
          [BACK TO REPORTS]
        </Link>
      </StationHead>

      {/* Severity as a full-width edge bar above the record: the report's
          weight is the first thing read, before any of its metadata. */}
      <div
        style={{
          height: "3px",
          background: severityColor(report.severity),
          opacity: 0.9,
        }}
        aria-hidden
      />

      <div className="hud-fields">
        <div>
          <div className="hud-readout__label">Report #</div>
          <div className="hud-recid mt-1 text-[var(--term-fg-bright)]">
            IR-{String(report.id).slice(0, 4).toUpperCase()}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Severity</div>
          <div className="mt-1">
            <SeverityBadge severity={report.severity} />
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Location</div>
          <div className="text-sm mt-1">{report.location || "UNSPECIFIED"}</div>
        </div>
        <div>
          <div className="hud-readout__label">Clearance</div>
          <div className="clearance-chip inline-block mt-1 text-xs">
            {clearanceLabel(report.clearanceRequired)}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Filed By</div>
          <div className="text-sm mt-1">{report.author.displayName}</div>
        </div>
        <div>
          <div className="hud-readout__label">Filed</div>
          <div className="hud-recid mt-1">
            {report.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            {report.updatedAt &&
              ` · REV ${report.revisionCount}, AMENDED ${report.updatedAt
                .toISOString()
                .slice(0, 16)
                .replace("T", " ")}`}
          </div>
        </div>
      </div>

      <HudPanel code="01" title="REPORT BODY">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm">
          {await renderBody(report.body, user)}
        </pre>
        {canManage && (
          <>
            <TickRule className="my-3" />
            <form action={deleteIncidentReportAction}>
              <input type="hidden" name="id" value={report.id} />
              <button className="term-button term-button--danger term-button--sm">
                DELETE REPORT
              </button>
            </form>
          </>
        )}
      </HudPanel>
    </>
  );
}
