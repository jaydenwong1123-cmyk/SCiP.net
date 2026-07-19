import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { listRevisions, REVISION_ENTITIES } from "@/lib/revisions";
import { RevisionHistory } from "@/components/revision-history";

export default async function IncidentHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const report = await db.incidentReport.findUnique({ where: { id } });
  if (!report || report.clearanceRequired > user.clearance) notFound();

  const revisions = await listRevisions(REVISION_ENTITIES.incident, id);

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: REVISION HISTORY — {report.title.toUpperCase()} ::
        </h1>
        <Link href={`/incidents/${report.id}`} className="term-link text-sm">
          [BACK TO REPORT]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        {revisions.length} ARCHIVED{" "}
        {revisions.length === 1 ? "VERSION" : "VERSIONS"} — NEWEST FIRST.
      </p>
      <RevisionHistory
        revisions={revisions}
        current={{ title: report.title, body: report.body }}
        viewer={user}
      />
    </div>
  );
}
