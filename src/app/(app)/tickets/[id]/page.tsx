import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { SignalDot } from "@/components/signal-badge";
import {
  TICKET_STATUSES,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  canHandleTicketType,
  canViewTicket,
  statusColor,
} from "@/lib/tickets";
import { renderRedactedName } from "@/lib/redact";
import { closeTicketAction } from "../actions";
import { ReplyForm } from "./reply-form";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { displayName: true, department: true, clearance: true } },
      closedBy: { select: { displayName: true } },
      replies: { orderBy: { createdAt: "asc" } },
    },
  });

  // A ticket the viewer may not read is indistinguishable from one that does
  // not exist — no "forbidden" page that confirms it is there.
  if (!ticket || !canViewTicket(user, ticket)) notFound();

  const canHandle = canHandleTicketType(user, ticket.type);
  const isOpen = ticket.status === TICKET_STATUSES.open;

  const requestedFile =
    ticket.type === TICKET_TYPES.scpAccess && ticket.scpFileId
      ? await db.scpFile.findUnique({
          where: { id: ticket.scpFileId },
          select: { id: true, title: true, clearanceRequired: true },
        })
      : null;

  return (
    <div className="space-y-4">
      <div className="term-panel space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg tracking-widest break-words">
            :: {ticket.subject.toUpperCase()} ::
          </h1>
          <Link href="/tickets" className="term-link text-sm">
            [BACK TO SUPPORT]
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--term-fg-dim)]">
          <span className="flex items-center gap-2">
            <SignalDot color={statusColor(ticket.status)} />
            {ticket.status.toUpperCase()}
          </span>
          <span>— {TICKET_TYPE_LABELS[ticket.type]}</span>
          <span>— OPENED BY: {ticket.author.displayName}</span>
          {ticket.author.department && <span>({ticket.author.department})</span>}
          <span>
            — {ticket.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          </span>
        </div>

        {requestedFile && (
          <div className="border border-[var(--term-border)]/40 p-2 text-sm space-y-1">
            <div className="text-xs text-[var(--term-fg-dim)]">
              REQUESTED FILE
            </div>
            <div>
              {requestedFile.title}{" "}
              <span className="text-[var(--term-fg-dim)]">
                [{clearanceLabel(requestedFile.clearanceRequired)}] — REQUESTER
                HOLDS {clearanceLabel(ticket.author.clearance)}
              </span>
            </div>
            <div className="text-[var(--term-fg-dim)]">
              DURATION REQUESTED: {ticket.requestedDays} DAY(S)
            </div>
          </div>
        )}

        {/* Ticket prose is plain text, not a document: no redaction markup or
            SCP cross-linking is applied, so it renders verbatim. */}
        <div className="text-sm break-words whitespace-pre-wrap">
          {ticket.body}
        </div>
      </div>

      <div className="term-panel space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">THREAD</h2>
        {ticket.replies.length === 0 && (
          <p className="text-sm">NO REPLIES YET.</p>
        )}
        {ticket.replies.map((r) => (
          <div
            key={r.id}
            className="text-sm border-b border-[var(--term-border)]/30 py-2 space-y-1"
          >
            <div className="text-xs text-[var(--term-fg-dim)]">
              {r.authorName || "SYSTEM"} —{" "}
              {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </div>
            <div className="break-words whitespace-pre-wrap">{r.body}</div>
          </div>
        ))}

        {isOpen ? (
          <ReplyForm ticketId={ticket.id} />
        ) : (
          <p className="text-sm text-[var(--term-fg-dim)]">
            THIS TICKET IS CLOSED — REPLIES ARE DISABLED.
          </p>
        )}
      </div>

      {!isOpen && (
        <div className="term-panel space-y-1 text-sm">
          <h2 className="text-sm text-[var(--term-fg-dim)]">RESOLUTION</h2>
          <p style={{ color: statusColor(ticket.status) }}>
            {ticket.status.toUpperCase()}
            {ticket.closedBy && (
              <>
                {" BY "}
                {renderRedactedName(ticket.closedBy.displayName ?? "", user)}
              </>
            )}
            {ticket.closedAt &&
              ` — ${ticket.closedAt.toISOString().slice(0, 16).replace("T", " ")}`}
          </p>
          {ticket.resolution && (
            <p className="text-[var(--term-fg-dim)]">▸ {ticket.resolution}</p>
          )}
        </div>
      )}

      {canHandle && isOpen && (
        <form action={closeTicketAction} className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-fg-dim)]">CLOSE TICKET</h2>
          {requestedFile && (
            <p className="text-xs text-[var(--term-amber)]">
              APPROVING ISSUES {ticket.author.displayName} A{" "}
              {ticket.requestedDays}-DAY ACCESS GRANT FOR THIS FILE
              AUTOMATICALLY.
            </p>
          )}
          <input type="hidden" name="ticketId" value={ticket.id} />
          <input
            type="text"
            name="resolution"
            placeholder="CLOSING NOTE (OPTIONAL, SHOWN TO REQUESTER)"
            maxLength={1000}
            className="term-input py-1 text-sm"
          />
          <div className="flex gap-2">
            <button name="decision" value="approve" className="term-button text-xs">
              {requestedFile ? "APPROVE & GRANT" : "RESOLVE"}
            </button>
            <button
              name="decision"
              value="deny"
              className="term-button text-xs"
              style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
            >
              DENY
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
