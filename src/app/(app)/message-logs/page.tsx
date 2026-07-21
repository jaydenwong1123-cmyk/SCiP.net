import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  MESSAGE_LOG_RETENTION_DAYS,
  canAccessMessageLogs,
  logRetentionCutoff,
} from "@/lib/message-logs";

type ThreadRow = {
  threadKey: string;
  subject: string;
  participants: string;
  latest: Date;
  count: number;
};

function stamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

export default async function MessageLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const user = await requireUser();
  if (!canAccessMessageLogs(user)) redirect("/");

  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();

  const cutoff = logRetentionCutoff();
  const messages = await db.message.findMany({
    where: {
      createdAt: { gte: cutoff },
      ...(query
        ? {
            OR: [
              { subject: { contains: query } },
              { sender: { displayName: { contains: query } } },
              { recipient: { displayName: { contains: query } } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      threadId: true,
      createdAt: true,
      sender: { select: { displayName: true } },
      recipient: { select: { displayName: true } },
    },
  });

  // Collapse into conversations. Legacy rows predate threadId and key on their
  // own id, matching how the member-facing terminal groups them.
  const threads = new Map<string, ThreadRow>();
  for (const m of messages) {
    const key = m.threadId ?? m.id;
    const existing = threads.get(key);
    if (!existing) {
      threads.set(key, {
        threadKey: key,
        subject: m.subject,
        // Messages arrive newest-first, so the first row seen carries the
        // most recent pairing and timestamp.
        participants: `${m.sender.displayName ?? "UNKNOWN"} → ${
          m.recipient.displayName ?? "UNKNOWN"
        }`,
        latest: m.createdAt,
        count: 1,
      });
    } else {
      existing.count += 1;
    }
  }

  const rows = [...threads.values()];

  return (
    <div className="space-y-4">
      <div className="term-panel space-y-1">
        <h1 className="text-lg tracking-widest">:: MESSAGE LOGS ::</h1>
        <p className="text-xs text-[var(--term-fg-dim)]">
          {"// RAISA OVERSIGHT — MEMBER CORRESPONDENCE"}
        </p>
        <p className="text-xs text-[var(--term-amber)]">
          RETENTION {MESSAGE_LOG_RETENTION_DAYS}D — ENTRIES BEFORE{" "}
          {stamp(cutoff)} HAVE BEEN PURGED FROM THIS LOG.
        </p>
      </div>

      <form className="term-panel flex flex-wrap items-center gap-2" action="">
        <label htmlFor="q" className="text-sm text-[var(--term-fg-dim)]">
          SEARCH
        </label>
        <input
          id="q"
          name="q"
          defaultValue={query}
          placeholder="subject or personnel name"
          className="term-input flex-1 min-w-[12rem] text-sm"
        />
        <button type="submit" className="term-button text-sm">
          [QUERY]
        </button>
        {query && (
          <Link href="/message-logs" className="term-link text-sm">
            [CLEAR]
          </Link>
        )}
      </form>

      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">
          LOGGED CONVERSATIONS ({rows.length})
        </h2>
        {rows.length === 0 && (
          <p className="text-sm">
            {query ? "NO MATCHING ENTRIES." : "NO ENTRIES WITHIN RETENTION WINDOW."}
          </p>
        )}
        {rows.map((t) => (
          <Link
            key={t.threadKey}
            href={`/message-logs/${t.threadKey}`}
            className="flex flex-wrap justify-between gap-x-4 text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
          >
            <span className="min-w-0 break-words">
              {t.subject}
              <span className="text-[var(--term-fg-dim)]">
                {" "}
                — {t.participants}
                {t.count > 1 && ` · ${t.count} msgs`}
              </span>
            </span>
            <span className="text-[var(--term-fg-dim)] shrink-0">
              {stamp(t.latest)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
