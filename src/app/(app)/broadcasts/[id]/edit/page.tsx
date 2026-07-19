import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canEditBroadcast } from "@/lib/doc-permissions";
import { EditBroadcastForm } from "./edit-broadcast-form";

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
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: AMEND {broadcast.title.toUpperCase()} ::
        </h1>
        <Link href="/broadcasts" className="term-link text-sm">
          [BACK TO BROADCASTS]
        </Link>
      </div>
      <EditBroadcastForm
        broadcast={{
          id: broadcast.id,
          title: broadcast.title,
          body: broadcast.body,
        }}
      />
    </div>
  );
}
