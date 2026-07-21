import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  MESSAGE_RETENTION_DAYS,
  messageRetentionCutoff,
  pruneExpiredMessages,
} from "@/lib/message-retention";

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

  return (
    <div className="space-y-4">
      <div className="term-panel flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: MESSAGE TERMINAL ::</h1>
        <Link href="/messages/compose" className="term-button text-sm">
          [+ COMPOSE]
        </Link>
      </div>

      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">
          CONVERSATIONS
          <span className="ml-2 text-xs">
            ({MESSAGE_RETENTION_DAYS}d retention)
          </span>
        </h2>
        {rows.length === 0 && <p className="text-sm">NO MESSAGES.</p>}
        {rows.map((t) => (
          <Link
            key={t.threadKey}
            href={`/messages/${t.latestId}`}
            className="flex flex-wrap justify-between gap-x-4 text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
          >
            <span className="min-w-0 break-words">
              {t.unread > 0 && (
                <span className="text-[var(--term-fg-bright)]">[{t.unread} NEW] </span>
              )}
              {t.subject}
              <span className="text-[var(--term-fg-dim)]">
                {" "}— {t.lastFromMe ? "to" : "from"} {t.otherName}
                {t.count > 1 && ` · ${t.count} msgs`}
              </span>
            </span>
            <span className="text-[var(--term-fg-dim)] shrink-0">
              {t.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
