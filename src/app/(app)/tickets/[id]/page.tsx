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
import {
  StationHead,
  HudPanel,
  TickRule,
  EmptyState,
} from "@/components/hud";

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
    <>
      <StationHead
        code="SEC-07 // SUPPORT TICKET"
        title={ticket.subject.toUpperCase()}
      >
        <Link href="/tickets" className="term-link text-sm">
          [BACK TO SUPPORT]
        </Link>
      </StationHead>

      <div className="hud-fields">
        <div>
          <div className="hud-readout__label">Ticket #</div>
          <div className="hud-recid mt-1 text-[var(--term-fg-bright)]">
            TKT-{String(ticket.id).slice(0, 4).toUpperCase()}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Status</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <SignalDot color={statusColor(ticket.status)} />
            {ticket.status.toUpperCase()}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Queue</div>
          <div className="text-sm mt-1">{TICKET_TYPE_LABELS[ticket.type]}</div>
        </div>
        <div>
          <div className="hud-readout__label">Opened By</div>
          <div className="text-sm mt-1">
            {renderRedactedName(ticket.author.displayName ?? "", user)}
            {ticket.author.department && (
              <span className="hud-recid"> ({ticket.author.department})</span>
            )}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Opened</div>
          <div className="hud-recid mt-1">
            {ticket.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          </div>
        </div>
      </div>

      <div className="term-panel space-y-4">
        {requestedFile && (
          <div className="term-panel term-panel--sub text-sm space-y-1">
            <div className="hud-readout__label">REQUESTED FILE</div>
            <div>
              {requestedFile.title}{" "}
              <span className="text-[var(--term-fg-dim)]">
                [{clearanceLabel(requestedFile.clearanceRequired)}] — REQUESTER
                HOLDS {clearanceLabel(ticket.author.clearance)}
              </span>
            </div>
            <div className="hud-recid">
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

      <HudPanel
        code="01"
        title="THREAD"
        status={`${ticket.replies.length} REPL${ticket.replies.length === 1 ? "Y" : "IES"}`}
      >
        <div className="hud-list">
          {ticket.replies.length === 0 && (
            <EmptyState glyph="○" title="No replies yet" />
          )}
          {ticket.replies.map((r) => (
            <div key={r.id} className="text-sm term-row py-2 space-y-1">
              <div className="hud-recid">
                {r.authorName ? renderRedactedName(r.authorName, user) : "SYSTEM"}{" "}
                · {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </div>
              <div className="break-words whitespace-pre-wrap">{r.body}</div>
            </div>
          ))}
        </div>

        <TickRule className="my-3" />
        {isOpen ? (
          <ReplyForm ticketId={ticket.id} />
        ) : (
          <p className="text-sm text-[var(--term-fg-dim)]">
            THIS TICKET IS CLOSED — REPLIES ARE DISABLED.
          </p>
        )}
      </HudPanel>

      {!isOpen && (
        <HudPanel code="02" title="RESOLUTION" status={ticket.status.toUpperCase()}>
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
            <p className="text-[var(--term-fg-dim)] text-sm">▸ {ticket.resolution}</p>
          )}
        </HudPanel>
      )}

      {canHandle && isOpen && (
        <form action={closeTicketAction} className="term-panel space-y-3">
          <div className="hud-panel-head">
            <span className="hud-panel-head__code">03</span>
            <span>CLOSE TICKET</span>
          </div>
          {requestedFile && (
            <p className="text-xs text-[var(--term-amber)]">
              APPROVING ISSUES{" "}
              {renderRedactedName(ticket.author.displayName ?? "", user)} A{" "}
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
            <button
              name="decision"
              value="approve"
              className="term-button term-button--sm"
            >
              {requestedFile ? "APPROVE & GRANT" : "RESOLVE"}
            </button>
            <button
              name="decision"
              value="deny"
              className="term-button term-button--danger term-button--sm"
            >
              DENY
            </button>
          </div>
        </form>
      )}
    </>
  );
}
