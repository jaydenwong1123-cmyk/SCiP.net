import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasStaffPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { classificationColor } from "@/lib/classification";
import { renderRedacted, canBypassRedaction } from "@/lib/redact";
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

  return (
    <div className="term-panel space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg tracking-widest">:: {file.title.toUpperCase()} ::</h1>
        <Link href="/scp" className="term-link text-sm">
          [BACK TO ARCHIVE]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        OBJECT CLASS:{" "}
        <span
          className="font-bold"
          style={{ color: classificationColor(file.classification) }}
        >
          {file.classification.toUpperCase()}
        </span>{" "}
        — CLEARANCE REQUIRED: {clearanceLabel(file.clearanceRequired)} — AUTHOR:{" "}
        {file.author.displayName}
      </p>
      <pre className="whitespace-pre-wrap break-words font-mono text-sm">
        {renderRedacted(file.body, user.clearance, canBypassRedaction(user))}
      </pre>
      {canManage && (
        <form
          action={deleteScpFileAction}
          className="pt-2 border-t border-[var(--term-border)]/30"
        >
          <input type="hidden" name="id" value={file.id} />
          <button className="term-button text-xs" style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}>
            [DELETE FILE]
          </button>
        </form>
      )}
    </div>
  );
}
