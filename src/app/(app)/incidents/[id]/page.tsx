import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { severityColor } from "@/lib/incident";
import { renderRedacted, canBypassRedaction } from "@/lib/redact";
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

  const canManage = user.isOwner || user.isAdmin || user.isStaff;

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: {report.title.toUpperCase()} ::
        </h1>
        <Link href="/incidents" className="term-link text-sm">
          [BACK TO REPORTS]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        SEVERITY:{" "}
        <span
          className="font-bold"
          style={{ color: severityColor(report.severity) }}
        >
          {report.severity.toUpperCase()}
        </span>{" "}
        {report.location && <>— LOCATION: {report.location} </>}— CLEARANCE:{" "}
        {clearanceLabel(report.clearanceRequired)} — FILED BY:{" "}
        {report.author.displayName} —{" "}
        {report.createdAt.toISOString().slice(0, 16).replace("T", " ")}
      </p>
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
