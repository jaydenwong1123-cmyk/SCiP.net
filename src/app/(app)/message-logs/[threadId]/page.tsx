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
import { StationHead, HudPanel, HudBanner, Readout } from "@/components/hud";

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
    <>
      <HudBanner level="secret">
        SECRET // RAISA OVERSIGHT // READ-ONLY TRANSCRIPT
      </HudBanner>

      <StationHead code="R5 // TRANSCRIPT" title={messages[0]!.subject}>
        <Readout label="Messages" value={messages.length} small />
        <Readout
          label="Retention"
          value={`${MESSAGE_LOG_RETENTION_DAYS}D`}
          tone="amber"
          small
        />
        <Link href="/message-logs" className="term-link text-sm">
          [← LOGS]
        </Link>
      </StationHead>

      <HudPanel code="01" title="INTERCEPT LOG" status="READ-ONLY">
        <div className="hud-list">
          {messages.map((m) => (
            <div key={m.id} className="term-row py-2">
              <div className="flex flex-wrap justify-between gap-x-4">
                <span className="hud-recid">
                  {m.sender.displayName ?? "UNKNOWN"} →{" "}
                  {m.recipient.displayName ?? "UNKNOWN"}
                </span>
                <span className="hud-recid">{stamp(m.createdAt)}</span>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                {m.body}
              </p>
            </div>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
