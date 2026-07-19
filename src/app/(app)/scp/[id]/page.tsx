import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasStaffPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { canEditScpFile } from "@/lib/doc-permissions";
import { renderBody } from "@/lib/render-body";
import { ClassificationBadge } from "@/components/signal-badge";
import { deleteScpFileAction } from "../actions";

export default async function ScpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const file = await db.scpFile.findUnique({
    where: { id },
    include: { author: { select: { displayName: true } } },
  });

  if (!file || file.clearanceRequired > user.clearance) notFound();

  const canManage = hasStaffPowers(user);
  const canEdit = canEditScpFile(user, file);

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: {file.title.toUpperCase()} ::
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {canEdit && (
            <Link href={`/scp/${file.id}/edit`} className="term-link">
              [AMEND]
            </Link>
          )}
          <Link href={`/scp/${file.id}/history`} className="term-link">
            [HISTORY{file.revisionCount > 0 ? ` (${file.revisionCount})` : ""}]
          </Link>
          <Link href="/scp" className="term-link">
            [BACK TO ARCHIVE]
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--term-fg-dim)]">
        <ClassificationBadge classification={file.classification} size="lg" />
        <span>CLEARANCE REQUIRED: {clearanceLabel(file.clearanceRequired)}</span>
        <span>— AUTHOR: {file.author.displayName}</span>
        {file.updatedAt && (
          <span>
            — REV {file.revisionCount}, AMENDED{" "}
            {file.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
          </span>
        )}
      </div>

      <pre className="whitespace-pre-wrap break-words font-mono text-sm">
        {await renderBody(file.body, user)}
      </pre>

      {canManage && (
        <form
          action={deleteScpFileAction}
          className="pt-2 border-t border-[var(--term-border)]/30"
        >
          <input type="hidden" name="id" value={file.id} />
          <button
            className="term-button text-xs"
            style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
          >
            [DELETE FILE]
          </button>
        </form>
      )}
    </div>
  );
}
