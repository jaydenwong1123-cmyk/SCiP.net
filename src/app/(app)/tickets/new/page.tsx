import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canRequestScpAccess } from "@/lib/tickets";
import { authoringClearance } from "@/lib/clearance";
import { NewTicketForm } from "./new-ticket-form";
import { StationHead, HudPanel } from "@/components/hud";

export default async function NewTicketPage() {
  const user = await requireUser();
  const mayRequestScp = canRequestScpAccess(user);

  // Only files above the member's clearance are worth requesting — anything at
  // or below it they can already read.
  const requestableFiles = mayRequestScp
    ? await db.scpFile.findMany({
        where: { clearanceRequired: { gt: authoringClearance(user) } },
        orderBy: { title: "asc" },
        select: { id: true, title: true, clearanceRequired: true },
      })
    : [];

  // The conduct appeal option is offered only to members who have a sanction on
  // record — active, expired or already lifted. This discloses nothing: a
  // sanction is announced to its subject by design (that is what separates it
  // from the silent conduct flag), so anyone who sees this option was already
  // told why. Offering it to everyone would be clutter; hiding it from someone
  // currently blacklisted would remove their only route to contest it.
  const sanctionCount = await db.hackSanction.count({
    where: { userId: user.id },
  });

  return (
    <>
      <StationHead code="SEC-07 // NEW SUPPORT REQUEST" title="OPEN A TICKET">
        <Link href="/tickets" className="term-link text-sm">
          [BACK TO SUPPORT]
        </Link>
      </StationHead>

      <HudPanel code="01" title="REQUEST DETAILS">
        <NewTicketForm
          canRequestScp={mayRequestScp}
          scpFiles={requestableFiles}
          canAppealConduct={sanctionCount > 0}
        />
      </HudPanel>
    </>
  );
}
