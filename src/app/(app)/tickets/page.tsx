import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { SignalDot } from "@/components/signal-badge";
import {
  TICKET_STATUSES,
  TICKET_TYPE_LABELS,
  handleableTicketTypes,
  statusColor,
} from "@/lib/tickets";
import { renderRedactedName } from "@/lib/redact";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";

type Viewer = Parameters<typeof renderRedactedName>[1];

function TicketRow({
  ticket,
  showAuthor,
  viewer,
}: {
  ticket: {
    id: string;
    type: string;
    subject: string;
    status: string;
    createdAt: Date;
    author: { displayName: string | null };
  };
  showAuthor: boolean;
  viewer: Viewer;
}) {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
    >
      <span className="flex items-center gap-2 min-w-0 break-words">
        <SignalDot color={statusColor(ticket.status)} />
        <span className="hud-recid">
          TKT-{String(ticket.id).slice(0, 4).toUpperCase()}
        </span>
        <span className="text-[var(--term-fg-bright)]">{ticket.subject}</span>
      </span>
      <span className="shrink-0 flex items-center gap-2">
        <span className="hud-recid">{TICKET_TYPE_LABELS[ticket.type]}</span>
        <span className="hud-recid">
          [{ticket.status.toUpperCase()}]
          {showAuthor && (
            <>
              {" — "}
              {renderRedactedName(ticket.author.displayName ?? "", viewer)}
            </>
          )}{" "}
          — {ticket.createdAt.toISOString().slice(0, 10)}
        </span>
      </span>
    </Link>
  );
}

export default async function TicketsPage() {
  const user = await requireUser();
  const queues = handleableTicketTypes(user);

  const [myTickets, queueTickets] = await Promise.all([
    db.ticket.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { displayName: true } } },
    }),
    queues.length > 0
      ? db.ticket.findMany({
          // Your own tickets already appear above; the queue is what you have
          // to act on, so exclude them rather than listing them twice.
          where: { type: { in: queues }, authorId: { not: user.id } },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          include: { author: { select: { displayName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const openQueue = queueTickets.filter(
    (t) => t.status === TICKET_STATUSES.open
  );
  const closedQueue = queueTickets.filter(
    (t) => t.status !== TICKET_STATUSES.open
  );

  return (
    <>
      <StationHead code="SEC-07 // SUPPORT DESK" title="IT SUPPORT">
        {queues.length > 0 && (
          <Readout
            label="Queue Open"
            value={openQueue.length}
            tone={openQueue.length > 0 ? "amber" : "dim"}
          />
        )}
        <Readout label="Your Tickets" value={myTickets.length} />
        <Link href="/tickets/new" className="term-button">
          + OPEN A TICKET
        </Link>
      </StationHead>

      {queues.length > 0 && (
        <HudPanel
          code="01"
          title="SUPPORT QUEUE"
          status={`${openQueue.length} OPEN`}
        >
          <p className="hud-readout__label mb-2">
            YOU HANDLE: {queues.map((t) => TICKET_TYPE_LABELS[t]).join(", ")}
          </p>
          <div className="hud-list">
            {openQueue.length === 0 && (
              <EmptyState glyph="○" title="No open tickets in your queue" />
            )}
            {openQueue.map((t) => (
              <TicketRow key={t.id} ticket={t} showAuthor viewer={user} />
            ))}
          </div>
          {closedQueue.length > 0 && (
            <details className="pt-2">
              <summary className="hud-readout__label cursor-pointer term-link">
                CLOSED ({closedQueue.length})
              </summary>
              <div className="hud-list pt-2">
                {closedQueue.map((t) => (
                  <TicketRow key={t.id} ticket={t} showAuthor viewer={user} />
                ))}
              </div>
            </details>
          )}
        </HudPanel>
      )}

      <HudPanel
        code={queues.length > 0 ? "02" : "01"}
        title="YOUR TICKETS"
        status={`${myTickets.length} FILED`}
      >
        <div className="hud-list">
          {myTickets.length === 0 && (
            <EmptyState glyph="✉" title="No tickets opened">
              <p className="text-xs">
                NEED A HAND? OPEN A TICKET AND SUPPORT WILL PICK IT UP.
              </p>
              <Link href="/tickets/new" className="term-button term-button--sm mt-1">
                OPEN A TICKET
              </Link>
            </EmptyState>
          )}
          {myTickets.map((t) => (
            <TicketRow key={t.id} ticket={t} showAuthor={false} viewer={user} />
          ))}
        </div>
      </HudPanel>
    </>
  );
}
