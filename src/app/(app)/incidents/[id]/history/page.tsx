import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { listRevisions, REVISION_ENTITIES } from "@/lib/revisions";
import { RevisionHistory } from "@/components/revision-history";
import { StationHead, HudPanel, Readout } from "@/components/hud";

export default async function IncidentHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Prior versions can hold text that was later amended away, so reading them
  // is Admin and above — matching SCP and broadcast revision history.
  if (!hasAdminPowers(user)) notFound();

  const report = await db.incidentReport.findUnique({ where: { id } });
  if (!report || report.clearanceRequired > user.clearance) notFound();

  const revisions = await listRevisions(REVISION_ENTITIES.incident, id);

  return (
    <>
      <StationHead
        code="SEC-04 // REVISION HISTORY"
        title={report.title.toUpperCase()}
      >
        <Readout label="Archived" value={revisions.length} />
        <Link href={`/incidents/${report.id}`} className="term-link text-sm">
          [BACK TO REPORT]
        </Link>
      </StationHead>
      <HudPanel code="01" title="ARCHIVED VERSIONS" status="NEWEST FIRST">
        <RevisionHistory
          revisions={revisions}
          current={{ title: report.title, body: report.body }}
          viewer={user}
        />
      </HudPanel>
    </>
  );
}
