import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ComposeForm } from "./compose-form";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; subject?: string }>;
}) {
  const user = await requireUser();
  const { to, subject } = await searchParams;
  const recipients = await db.user.findMany({
    where: { displayName: { not: null }, id: { not: user.id } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });

  // Only honor a prefilled recipient if it's a valid, selectable member.
  const defaultRecipientId = recipients.some((r) => r.id === to) ? to : "";

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: COMPOSE MESSAGE ::</h1>
      <ComposeForm
        recipients={recipients}
        defaultRecipientId={defaultRecipientId}
        defaultSubject={subject ?? ""}
      />
    </div>
  );
}
