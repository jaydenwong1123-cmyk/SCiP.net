import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canRequestScpAccess } from "@/lib/tickets";
import { NewTicketForm } from "./new-ticket-form";

export default async function NewTicketPage() {
  const user = await requireUser();
  const mayRequestScp = canRequestScpAccess(user);

  // Only files above the member's clearance are worth requesting — anything at
  // or below it they can already read.
  const requestableFiles = mayRequestScp
    ? await db.scpFile.findMany({
        where: { clearanceRequired: { gt: user.clearance } },
        orderBy: { title: "asc" },
        select: { id: true, title: true, clearanceRequired: true },
      })
    : [];

  return (
    <div className="space-y-4">
      <div className="term-panel flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: OPEN A TICKET ::</h1>
        <Link href="/tickets" className="term-link text-sm">
          [BACK TO SUPPORT]
        </Link>
      </div>

      <div className="term-panel">
        <NewTicketForm
          canRequestScp={mayRequestScp}
          scpFiles={requestableFiles}
        />
      </div>
    </div>
  );
}
