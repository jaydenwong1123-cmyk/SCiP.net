import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { listRevisions, REVISION_ENTITIES } from "@/lib/revisions";
import { RevisionHistory } from "@/components/revision-history";

export default async function ScpHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const file = await db.scpFile.findUnique({ where: { id } });
  if (!file || file.clearanceRequired > user.clearance) notFound();

  const revisions = await listRevisions(REVISION_ENTITIES.scp, id);

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: REVISION HISTORY — {file.title.toUpperCase()} ::
        </h1>
        <Link href={`/scp/${file.id}`} className="term-link text-sm">
          [BACK TO FILE]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        {revisions.length} ARCHIVED{" "}
        {revisions.length === 1 ? "VERSION" : "VERSIONS"} — NEWEST FIRST.
      </p>
      <RevisionHistory
        revisions={revisions}
        current={{ title: file.title, body: file.body }}
        viewer={user}
      />
    </div>
  );
}
