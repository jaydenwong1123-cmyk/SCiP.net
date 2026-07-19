import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasStaffPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { canEditIncident } from "@/lib/doc-permissions";
import { renderRedacted, canBypassRedaction } from "@/lib/redact";
import { SeverityBadge } from "@/components/signal-badge";
import { deleteIncidentReportAction } from "../actions";

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

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: {report.title.toUpperCase()} ::
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {canEdit && (
            <Link href={`/incidents/${report.id}/edit`} className="term-link">
              [AMEND]
            </Link>
          )}
          <Link href={`/incidents/${report.id}/history`} className="term-link">
            [HISTORY{report.revisionCount > 0 ? ` (${report.revisionCount})` : ""}]
          </Link>
          <Link href="/incidents" className="term-link">
            [BACK TO REPORTS]
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--term-fg-dim)]">
        <SeverityBadge severity={report.severity} size="lg" />
        {report.location && <span>LOCATION: {report.location}</span>}
        <span>— CLEARANCE: {clearanceLabel(report.clearanceRequired)}</span>
        <span>— FILED BY: {report.author.displayName}</span>
        <span>— {report.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
        {report.updatedAt && (
          <span>
            — REV {report.revisionCount}, AMENDED{" "}
            {report.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
          </span>
        )}
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-sm">
        {renderRedacted(report.body, user.clearance, canBypassRedaction(user))}
      </pre>
      {canManage && (
        <form
          action={deleteIncidentReportAction}
          className="pt-2 border-t border-[var(--term-border)]/30"
        >
          <input type="hidden" name="id" value={report.id} />
          <button
            className="term-button text-xs"
            style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
          >
            [DELETE REPORT]
          </button>
        </form>
      )}
    </div>
  );
}
