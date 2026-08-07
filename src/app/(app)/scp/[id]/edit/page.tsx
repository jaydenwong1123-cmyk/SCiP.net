import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canEditScpFile } from "@/lib/doc-permissions";
import { authoringClearance } from "@/lib/clearance";
import { EditScpForm } from "./edit-scp-form";
import { StationHead, HudPanel } from "@/components/hud";

export default async function EditScpPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const file = await db.scpFile.findUnique({ where: { id } });
  // A file above the viewer's clearance is treated as nonexistent, matching
  // the detail page — the edit route must not leak that it exists.
  if (!file || file.clearanceRequired > authoringClearance(user)) notFound();
  // Readable but not editable: send them back to the document rather than to
  // a 403, matching how the rest of the app degrades permission failures.
  if (!canEditScpFile(user, file)) redirect(`/scp/${id}`);

  return (
    <>
      <StationHead
        code="SEC-03 // AMEND RECORD"
        title={file.title.toUpperCase()}
      >
        <Link href={`/scp/${file.id}`} className="term-link text-sm">
          [BACK TO FILE]
        </Link>
      </StationHead>
      <HudPanel code="01" title="AMENDMENT" status="PRIOR VERSION ARCHIVED">
      <p className="text-xs text-[var(--term-fg-dim)] mb-3">
        THE CURRENT VERSION IS ARCHIVED TO THE REVISION HISTORY BEFORE YOUR
        CHANGES ARE APPLIED.
      </p>
      <EditScpForm
        file={{
          id: file.id,
          title: file.title,
          body: file.body,
          classification: file.classification,
          clearanceRequired: file.clearanceRequired,
        }}
        maxClearance={authoringClearance(user)}
      />
      </HudPanel>
    </>
  );
}
