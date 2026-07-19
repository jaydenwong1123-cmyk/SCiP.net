import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canEditIncident } from "@/lib/doc-permissions";
import { EditIncidentForm } from "./edit-incident-form";

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.incidentReport.findUnique({ where: { id } });
  if (!report || report.clearanceRequired > user.clearance) notFound();
  if (!canEditIncident(user, report)) redirect(`/incidents/${id}`);

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: AMEND {report.title.toUpperCase()} ::
        </h1>
        <Link href={`/incidents/${report.id}`} className="term-link text-sm">
          [BACK TO REPORT]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        THE CURRENT VERSION IS ARCHIVED TO THE REVISION HISTORY BEFORE YOUR
        CHANGES ARE APPLIED.
      </p>
      <EditIncidentForm
        report={{
          id: report.id,
          title: report.title,
          location: report.location,
          body: report.body,
          severity: report.severity,
          clearanceRequired: report.clearanceRequired,
        }}
        maxClearance={user.clearance}
      />
    </div>
  );
}
