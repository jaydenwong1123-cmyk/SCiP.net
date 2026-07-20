"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logAudit, AUDIT_ACTIONS } from "@/lib/audit";
import { createNotification, NOTIFICATION_TYPES } from "@/lib/notifications";
import { findNonAsciiFormField, NON_ASCII_ERROR } from "@/lib/validation";
import {
  TICKET_TYPES,
  TICKET_STATUSES,
  TICKET_TYPE_LABELS,
  MIN_TICKET_GRANT_DAYS,
  MAX_TICKET_GRANT_DAYS,
  canHandleTicketType,
  canRequestScpAccess,
  canViewTicket,
  isValidTicketType,
} from "@/lib/tickets";

type ActionState = { ok: boolean; error?: string } | null;

// Everyone who works the queue a ticket of this type lands in. Used to fan out
// the "new ticket" notification, so a ticket never sits unseen waiting for
// someone to happen to open the hub.
async function handlersFor(type: string) {
  if (type === TICKET_TYPES.bug) {
    return db.user.findMany({ where: { isOwner: true }, select: { id: true } });
  }
  if (type === TICKET_TYPES.scpAccess) {
    return db.user.findMany({
      where: {
        suspended: false,
        OR: [{ isOwner: true }, { isCoOwner: true }, { isAdmin: true }, { isStaff: true }],
      },
      select: { id: true },
    });
  }
  return db.user.findMany({
    where: {
      suspended: false,
      OR: [
        { isOwner: true },
        { isCoOwner: true },
        { isAdmin: true },
        { isStaff: true },
        { isHelper: true },
      ],
    },
    select: { id: true },
  });
}

export async function createTicketAction(
  _prevState: ActionState,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const type = String(formData.get("type") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!isValidTicketType(type)) {
    return { ok: false, error: "INVALID TICKET TYPE." };
  }
  if (!subject) return { ok: false, error: "SUBJECT IS REQUIRED." };
  if (!body) return { ok: false, error: "DETAILS ARE REQUIRED." };

  let scpFileId: string | null = null;
  let requestedDays: number | null = null;

  if (type === TICKET_TYPES.scpAccess) {
    // Department gate is re-checked here, not just in the UI — a Server Action
    // is reachable by direct POST.
    if (!canRequestScpAccess(user)) {
      return {
        ok: false,
        error:
          "SCP FILE ACCESS REQUESTS ARE LIMITED TO FACILITY ENFORCEMENT AND SCIENTIFIC DEPARTMENT PERSONNEL.",
      };
    }
    scpFileId = String(formData.get("scpFileId") ?? "");
    requestedDays = Number(formData.get("requestedDays"));

    if (!scpFileId) return { ok: false, error: "SELECT AN SCP FILE." };
    if (
      !Number.isInteger(requestedDays) ||
      requestedDays < MIN_TICKET_GRANT_DAYS ||
      requestedDays > MAX_TICKET_GRANT_DAYS
    ) {
      return {
        ok: false,
        error: `DURATION MUST BE ${MIN_TICKET_GRANT_DAYS}-${MAX_TICKET_GRANT_DAYS} DAYS.`,
      };
    }

    const file = await db.scpFile.findUnique({ where: { id: scpFileId } });
    if (!file) return { ok: false, error: "FILE NOT FOUND." };
    if (file.clearanceRequired <= user.clearance) {
      return {
        ok: false,
        error: "YOUR CLEARANCE ALREADY GRANTS ACCESS TO THAT FILE.",
      };
    }
  }

  const ticket = await db.ticket.create({
    data: {
      type,
      subject: subject.slice(0, 200),
      body: body.slice(0, 5000),
      authorId: user.id,
      scpFileId,
      requestedDays,
    },
  });

  const handlers = await handlersFor(type);
  await Promise.all(
    handlers
      .filter((h) => h.id !== user.id)
      .map((h) =>
        createNotification({
          userId: h.id,
          type: NOTIFICATION_TYPES.ticket,
          body: `NEW ${TICKET_TYPE_LABELS[type]}: ${subject.slice(0, 120)}`,
          link: `/tickets/${ticket.id}`,
        })
      )
  );

  revalidatePath("/tickets");
  redirect(`/tickets/${ticket.id}`);
}

export async function replyToTicketAction(
  _prevState: ActionState,
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (findNonAsciiFormField(formData)) {
    return { ok: false, error: NON_ASCII_ERROR };
  }

  const ticketId = String(formData.get("ticketId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "REPLY CANNOT BE EMPTY." };

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || !canViewTicket(user, ticket)) {
    return { ok: false, error: "TICKET NOT FOUND." };
  }
  if (ticket.status !== TICKET_STATUSES.open) {
    return { ok: false, error: "THIS TICKET IS CLOSED." };
  }

  await db.ticketReply.create({
    data: {
      ticketId,
      body: body.slice(0, 5000),
      authorId: user.id,
      authorName: user.displayName ?? user.email,
    },
  });
  await db.ticket.update({
    where: { id: ticketId },
    data: { updatedAt: new Date() },
  });

  // Notify the other side: the requester hears from support, and support hears
  // from the requester.
  if (ticket.authorId === user.id) {
    const handlers = await handlersFor(ticket.type);
    await Promise.all(
      handlers
        .filter((h) => h.id !== user.id)
        .map((h) =>
          createNotification({
            userId: h.id,
            type: NOTIFICATION_TYPES.ticket,
            body: `REPLY ON TICKET: ${ticket.subject.slice(0, 120)}`,
            link: `/tickets/${ticket.id}`,
          })
        )
    );
  } else {
    await createNotification({
      userId: ticket.authorId,
      type: NOTIFICATION_TYPES.ticket,
      body: `SUPPORT REPLIED TO YOUR TICKET: ${ticket.subject.slice(0, 120)}`,
      link: `/tickets/${ticket.id}`,
    });
  }

  revalidatePath(`/tickets/${ticketId}`);
  return { ok: true };
}

export async function closeTicketAction(formData: FormData) {
  const actor = await requireUser();
  if (findNonAsciiFormField(formData)) return;

  const ticketId = String(formData.get("ticketId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const resolution = String(formData.get("resolution") ?? "").trim();

  const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.status !== TICKET_STATUSES.open) return;
  // Only a queue handler may close a ticket — not the requester.
  if (!canHandleTicketType(actor, ticket.type)) return;

  const approved = decision === "approve";
  const status = approved ? TICKET_STATUSES.resolved : TICKET_STATUSES.denied;

  // Approving an SCP access request is what actually issues the grant, so the
  // requester never needs a second trip through the SCP file page.
  let granted = false;
  if (approved && ticket.type === TICKET_TYPES.scpAccess && ticket.scpFileId) {
    const [file, requester] = await Promise.all([
      db.scpFile.findUnique({ where: { id: ticket.scpFileId } }),
      db.user.findUnique({ where: { id: ticket.authorId } }),
    ]);
    // Skip the grant if the file is gone or the requester's clearance has
    // risen since they asked — the grant would be meaningless either way.
    if (file && requester && requester.clearance < file.clearanceRequired) {
      const days = ticket.requestedDays ?? MIN_TICKET_GRANT_DAYS;
      await db.scpAccessGrant.create({
        data: {
          scpFileId: file.id,
          userId: requester.id,
          grantedById: actor.id,
          expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        },
      });
      granted = true;

      await logAudit({
        action: AUDIT_ACTIONS.scpAccessGranted,
        actor,
        targetType: "scp",
        targetId: file.id,
        targetName: file.title,
        summary: `Granted ${requester.displayName ?? requester.email} temporary access to "${file.title}" for ${days} day(s) via ticket`,
      });
      revalidatePath(`/scp/${file.id}`);
    }
  }

  await db.ticket.update({
    where: { id: ticketId },
    data: {
      status,
      resolution: resolution.slice(0, 1000),
      closedAt: new Date(),
      closedById: actor.id,
    },
  });

  await createNotification({
    userId: ticket.authorId,
    type: NOTIFICATION_TYPES.ticket,
    body: `YOUR TICKET WAS ${status.toUpperCase()}: ${ticket.subject.slice(0, 120)}`,
    link: `/tickets/${ticket.id}`,
  });

  await logAudit({
    action: AUDIT_ACTIONS.ticketClosed,
    actor,
    targetType: "ticket",
    targetId: ticket.id,
    targetName: ticket.subject,
    summary: `${approved ? "Resolved" : "Denied"} ${TICKET_TYPE_LABELS[ticket.type]} "${ticket.subject}"${
      approved && ticket.type === TICKET_TYPES.scpAccess && !granted
        ? " (no grant issued — file missing or clearance already sufficient)"
        : ""
    }${resolution ? ` — ${resolution.slice(0, 200)}` : ""}`,
  });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
}
