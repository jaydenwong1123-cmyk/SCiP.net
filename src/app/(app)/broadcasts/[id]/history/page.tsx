import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { listRevisions, REVISION_ENTITIES } from "@/lib/revisions";
import { RevisionHistory } from "@/components/revision-history";
import { StationHead, HudPanel, Readout } from "@/components/hud";

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
    <>
      <StationHead
        code="SEC-05 // REVISION HISTORY"
        title={broadcast.title.toUpperCase()}
      >
        <Readout label="Archived" value={revisions.length} />
        <Link href="/broadcasts" className="term-link text-sm">
          [BACK TO BROADCASTS]
        </Link>
      </StationHead>
      <HudPanel code="01" title="ARCHIVED VERSIONS" status="NEWEST FIRST">
        <RevisionHistory
          revisions={revisions}
          current={{ title: broadcast.title, body: broadcast.body }}
          viewer={user}
        />
      </HudPanel>
    </>
  );
}
