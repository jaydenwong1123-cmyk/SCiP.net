import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canEditIncident } from "@/lib/doc-permissions";
import { authoringClearance } from "@/lib/clearance";
import { EditIncidentForm } from "./edit-incident-form";
import { StationHead, HudPanel } from "@/components/hud";

export default async function EditIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.incidentReport.findUnique({ where: { id } });
  if (!report || report.clearanceRequired > authoringClearance(user)) notFound();
  if (!canEditIncident(user, report)) redirect(`/incidents/${id}`);

  return (
    <>
      <StationHead
        code="SEC-04 // AMEND REPORT"
        title={report.title.toUpperCase()}
      >
        <Link href={`/incidents/${report.id}`} className="term-link text-sm">
          [BACK TO REPORT]
        </Link>
      </StationHead>
      <HudPanel code="01" title="AMENDMENT" status="PRIOR VERSION ARCHIVED">
      <p className="text-xs text-[var(--term-fg-dim)] mb-3">
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
        maxClearance={authoringClearance(user)}
      />
      </HudPanel>
    </>
  );
}
