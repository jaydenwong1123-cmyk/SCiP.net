import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import {
  MESSAGE_LOG_RETENTION_DAYS,
  canAccessMessageLogs,
  logRetentionCutoff,
} from "@/lib/message-logs";

function stamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export default async function MessageLogThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const user = await requireUser();
  if (!canAccessMessageLogs(user)) redirect("/");

  const { threadId } = await params;
  const cutoff = logRetentionCutoff();

  const messages = await db.message.findMany({
    where: {
      createdAt: { gte: cutoff },
      // Legacy rows have no threadId and are addressed by their own id.
      OR: [{ threadId }, { id: threadId }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      subject: true,
      body: true,
      createdAt: true,
      sender: { select: { displayName: true } },
      recipient: { select: { displayName: true } },
    },
  });

  if (messages.length === 0) notFound();

  // Reading another member's correspondence is itself a privileged act, so it
  // goes in the audit trail. Only thread opens are recorded — the index page
  // shows subjects and participants, not content.
  await logAudit({
    action: AUDIT_ACTIONS.messageLogViewed,
    actor: user,
    targetType: "message_thread",
    targetId: threadId,
    targetName: messages[0]!.subject,
    summary: `Read ${messages.length} logged message(s) between ${
      messages[0]!.sender.displayName ?? "UNKNOWN"
    } and ${messages[0]!.recipient.displayName ?? "UNKNOWN"}`,
  });

  return (
    <div className="space-y-4">
      <div className="term-panel space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg tracking-widest break-words">
            :: {messages[0]!.subject} ::
          </h1>
          <Link href="/message-logs" className="term-link text-sm">
            [← LOGS]
          </Link>
        </div>
        <p className="text-xs text-[var(--term-fg-dim)]">
          {"// RAISA OVERSIGHT — READ-ONLY TRANSCRIPT"} · RETENTION{" "}
          {MESSAGE_LOG_RETENTION_DAYS}D
        </p>
      </div>

      <div className="term-panel space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className="border-b border-[var(--term-border)]/30 pb-3 last:border-0 last:pb-0"
          >
            <div className="flex flex-wrap justify-between gap-x-4 text-xs text-[var(--term-fg-dim)]">
              <span>
                {m.sender.displayName ?? "UNKNOWN"} →{" "}
                {m.recipient.displayName ?? "UNKNOWN"}
              </span>
              <span>{stamp(m.createdAt)}</span>
            </div>
            <p className="mt-1 text-sm whitespace-pre-wrap break-words">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
