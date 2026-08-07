import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canEditBroadcast } from "@/lib/doc-permissions";
import { EditBroadcastForm } from "./edit-broadcast-form";
import { StationHead, HudPanel } from "@/components/hud";

export default async function EditBroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const broadcast = await db.broadcast.findUnique({ where: { id } });
  if (!broadcast) notFound();
  if (!canEditBroadcast(user, broadcast)) redirect("/broadcasts");

  return (
    <>
      <StationHead
        code="SEC-05 // AMEND DIRECTIVE"
        title={broadcast.title.toUpperCase()}
      >
        <Link href="/broadcasts" className="term-link text-sm">
          [BACK TO BROADCASTS]
        </Link>
      </StationHead>
      <HudPanel code="01" title="AMENDMENT" status="PRIOR VERSION ARCHIVED">
        <EditBroadcastForm
          broadcast={{
            id: broadcast.id,
            title: broadcast.title,
            body: broadcast.body,
          }}
        />
      </HudPanel>
    </>
  );
}
