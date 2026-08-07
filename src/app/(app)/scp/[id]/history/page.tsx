import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { listRevisions, REVISION_ENTITIES } from "@/lib/revisions";
import { RevisionHistory } from "@/components/revision-history";
import { StationHead, HudPanel, Readout } from "@/components/hud";

export default async function ScpHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Revision history exposes prior versions of a file — including text that has
  // since been amended away — so it is Admin and above only. Staff can amend
  // files but cannot read what an amendment replaced.
  if (!hasAdminPowers(user)) notFound();

  const file = await db.scpFile.findUnique({ where: { id } });
  if (!file || file.clearanceRequired > user.clearance) notFound();

  const revisions = await listRevisions(REVISION_ENTITIES.scp, id);

  return (
    <>
      <StationHead
        code="SEC-03 // REVISION HISTORY"
        title={file.title.toUpperCase()}
      >
        <Readout label="Archived" value={revisions.length} />
        <Link href={`/scp/${file.id}`} className="term-link text-sm">
          [BACK TO FILE]
        </Link>
      </StationHead>
      <HudPanel code="01" title="ARCHIVED VERSIONS" status="NEWEST FIRST">
        <RevisionHistory
          revisions={revisions}
          current={{ title: file.title, body: file.body }}
          viewer={user}
        />
      </HudPanel>
    </>
  );
}
