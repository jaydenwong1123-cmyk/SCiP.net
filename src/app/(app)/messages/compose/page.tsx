import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { ComposeForm } from "./compose-form";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; subject?: string; thread?: string }>;
}) {
  const user = await requireUser();
  const { to, subject, thread } = await searchParams;
  const recipients = await db.user.findMany({
    where: { displayName: { not: null }, id: { not: user.id } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true },
  });

  // Only honor a prefilled recipient if it's a valid, selectable member.
  const defaultRecipientId = recipients.some((r) => r.id === to) ? to : "";

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: COMPOSE MESSAGE ::</h1>
        <Link href="/messages" className="term-link text-sm shrink-0">
          [BACK]
        </Link>
      </div>
      <ComposeForm
        recipients={recipients}
        defaultRecipientId={defaultRecipientId}
        defaultSubject={subject ?? ""}
        threadId={thread ?? ""}
      />
    </div>
  );
}
