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

function TicketRow({
  ticket,
  showAuthor,
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
}) {
  return (
    <Link
      href={`/tickets/${ticket.id}`}
      className="flex flex-wrap justify-between gap-x-4 text-sm term-row border-b border-[var(--term-border)]/30 term-link"
    >
      <span className="flex items-center gap-2 min-w-0 break-words">
        <SignalDot color={statusColor(ticket.status)} />
        {ticket.subject}
      </span>
      <span className="text-[var(--term-fg-dim)] shrink-0 flex items-center gap-2">
        <span className="text-[10px] tracking-wider">
          {TICKET_TYPE_LABELS[ticket.type]}
        </span>
        <span>
          [{ticket.status.toUpperCase()}]
          {showAuthor && ` — ${ticket.author.displayName}`} —{" "}
          {ticket.createdAt.toISOString().slice(0, 10)}
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
    <div className="space-y-4">
      <div className="term-panel flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: IT SUPPORT ::</h1>
        <Link href="/tickets/new" className="term-button text-sm">
          [+ OPEN A TICKET]
        </Link>
      </div>

      {queues.length > 0 && (
        <div className="term-panel space-y-2">
          <h2 className="text-sm text-[var(--term-fg-dim)]">
            SUPPORT QUEUE {openQueue.length > 0 && `(${openQueue.length} OPEN)`}
          </h2>
          <p className="text-xs text-[var(--term-fg-dim)]">
            YOU HANDLE: {queues.map((t) => TICKET_TYPE_LABELS[t]).join(", ")}
          </p>
          {openQueue.length === 0 && (
            <p className="text-sm">NO OPEN TICKETS IN YOUR QUEUE.</p>
          )}
          {openQueue.map((t) => (
            <TicketRow key={t.id} ticket={t} showAuthor />
          ))}
          {closedQueue.length > 0 && (
            <details className="pt-2">
              <summary className="text-xs text-[var(--term-fg-dim)] cursor-pointer term-link">
                CLOSED ({closedQueue.length})
              </summary>
              <div className="pt-2">
                {closedQueue.map((t) => (
                  <TicketRow key={t.id} ticket={t} showAuthor />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">YOUR TICKETS</h2>
        {myTickets.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__glyph" aria-hidden>
              ✉
            </span>
            <p className="empty-state__title">NO TICKETS OPENED</p>
            <p className="text-sm">
              NEED A HAND? OPEN A TICKET AND SUPPORT WILL PICK IT UP.
            </p>
            <Link href="/tickets/new" className="term-button text-xs mt-1">
              OPEN A TICKET
            </Link>
          </div>
        )}
        {myTickets.map((t) => (
          <TicketRow key={t.id} ticket={t} showAuthor={false} />
        ))}
      </div>
    </div>
  );
}
