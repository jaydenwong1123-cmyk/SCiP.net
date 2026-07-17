import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ComposeForm } from "./compose-form";

export default async function ComposePage() {
  const user = await requireUser();
  const recipients = await db.user.findMany({
    where: { displayName: { not: null }, id: { not: user.id } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: COMPOSE MESSAGE ::</h1>
      <ComposeForm recipients={recipients} />
    </div>
  );
}
