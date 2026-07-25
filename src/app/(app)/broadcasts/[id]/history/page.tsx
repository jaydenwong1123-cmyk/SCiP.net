import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { listRevisions, REVISION_ENTITIES } from "@/lib/revisions";
import { RevisionHistory } from "@/components/revision-history";

export default async function BroadcastHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Prior versions can hold text that was later amended away, so reading them
  // is Admin and above — matching SCP and incident revision history.
  if (!hasAdminPowers(user)) notFound();

  const broadcast = await db.broadcast.findUnique({ where: { id } });
  if (!broadcast) notFound();

  const revisions = await listRevisions(REVISION_ENTITIES.broadcast, id);

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: REVISION HISTORY — {broadcast.title.toUpperCase()} ::
        </h1>
        <Link href="/broadcasts" className="term-link text-sm">
          [BACK TO BROADCASTS]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        {revisions.length} ARCHIVED{" "}
        {revisions.length === 1 ? "VERSION" : "VERSIONS"} — NEWEST FIRST.
      </p>
      <RevisionHistory
        revisions={revisions}
        current={{ title: broadcast.title, body: broadcast.body }}
        viewer={user}
      />
    </div>
  );
}
