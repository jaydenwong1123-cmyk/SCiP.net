import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  MESSAGE_RETENTION_DAYS,
  messageRetentionCutoff,
  pruneExpiredMessages,
} from "@/lib/message-retention";
import { renderRedactedName } from "@/lib/redact";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";

type ThreadRow = {
  threadKey: string;
  latestId: string;
  subject: string;
  otherName: string | null;
  createdAt: Date;
  count: number;
  unread: number;
  lastFromMe: boolean;
};

export default async function MessagesPage() {
  const user = await requireUser();

  await pruneExpiredMessages();

  // Filtered as well as swept, so a lapsed message disappears on schedule even
  // when the probabilistic sweep hasn't fired yet.
  const messages = await db.message.findMany({
    where: {
      createdAt: { gte: messageRetentionCutoff() },
      OR: [{ recipientId: user.id }, { senderId: user.id }],
    },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { displayName: true } },
      recipient: { select: { displayName: true } },
    },
  });

  // Collapse into conversations keyed by threadId (legacy rows key on their own id).
  const threads = new Map<string, ThreadRow>();
  for (const m of messages) {
    const key = m.threadId ?? m.id;
    const fromMe = m.senderId === user.id;
    const otherName = fromMe ? m.recipient.displayName : m.sender.displayName;
    const existing = threads.get(key);
    if (!existing) {
      threads.set(key, {
        threadKey: key,
        latestId: m.id, // messages arrive newest-first
        subject: m.subject,
        otherName,
        createdAt: m.createdAt,
        count: 1,
        unread: !fromMe && !m.read ? 1 : 0,
        lastFromMe: fromMe,
      });
    } else {
      existing.count += 1;
      if (!fromMe && !m.read) existing.unread += 1;
    }
  }

  const rows = [...threads.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );

  const unreadTotal = rows.reduce((n, t) => n + t.unread, 0);

  return (
    <>
      <StationHead code="SEC-02 // INTERNAL CORRESPONDENCE" title="MESSAGE TERMINAL">
        <Readout label="Threads" value={rows.length} />
        <Readout
          label="Unread"
          value={unreadTotal}
          tone={unreadTotal > 0 ? "amber" : "dim"}
        />
        <Link href="/messages/compose" className="term-button">
          + COMPOSE
        </Link>
      </StationHead>

      <HudPanel
        code="01"
        title="CONVERSATIONS"
        status={`${MESSAGE_RETENTION_DAYS}D RETENTION`}
      >
        <div className="hud-list">
          {rows.length === 0 && <EmptyState glyph="✉" title="No messages" />}
          {rows.map((t) => (
            <Link
              key={t.threadKey}
              href={`/messages/${t.latestId}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
            >
              <span className="min-w-0 break-words flex items-center gap-2 flex-wrap">
                {t.unread > 0 && (
                  <span className="hud-rail__badge">{t.unread} NEW</span>
                )}
                <span className="text-[var(--term-fg-bright)]">{t.subject}</span>
                <span className="hud-recid">
                  {t.lastFromMe ? "TO" : "FROM"}{" "}
                  {renderRedactedName(t.otherName ?? "", user)}
                  {t.count > 1 && ` · ${t.count} MSGS`}
                </span>
              </span>
              <span className="hud-recid shrink-0">
                {t.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
