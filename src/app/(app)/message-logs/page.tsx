import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  MESSAGE_LOG_RETENTION_DAYS,
  canAccessMessageLogs,
  logRetentionCutoff,
} from "@/lib/message-logs";
import {
  StationHead,
  HudPanel,
  HudBanner,
  Readout,
  EmptyState,
} from "@/components/hud";

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
    <>
      <HudBanner level="secret">
        SECRET // RAISA OVERSIGHT // MEMBER CORRESPONDENCE
      </HudBanner>

      <StationHead code="R5 // CORRESPONDENCE OVERSIGHT" title="MESSAGE LOGS">
        <Readout label="Threads" value={rows.length} />
        <Readout
          label="Retention"
          value={`${MESSAGE_LOG_RETENTION_DAYS}D`}
          tone="amber"
          small
        />
      </StationHead>

      <p className="text-[10px] text-[var(--term-amber)]">
        ENTRIES BEFORE {stamp(cutoff)} HAVE BEEN PURGED FROM THIS LOG.
      </p>

      <HudPanel code="01" title="QUERY">
        <form className="flex flex-wrap items-center gap-2" action="">
          <label htmlFor="q" className="hud-readout__label">
            SEARCH
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="subject or personnel name"
            className="term-input flex-1 min-w-[12rem] text-sm"
          />
          <button type="submit" className="term-button">
            QUERY
          </button>
          {query && (
            <Link href="/message-logs" className="term-link text-sm">
              [CLEAR]
            </Link>
          )}
        </form>
      </HudPanel>

      <HudPanel
        code="02"
        title="LOGGED CONVERSATIONS"
        status={`${rows.length} THREAD${rows.length === 1 ? "" : "S"}`}
      >
        <div className="hud-list">
          {rows.length === 0 && (
            <EmptyState
              glyph="✉"
              title={query ? "No matching entries" : "No entries in window"}
            />
          )}
          {rows.map((t) => (
            <Link
              key={t.threadKey}
              href={`/message-logs/${t.threadKey}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
            >
              <span className="min-w-0 break-words flex items-center gap-2 flex-wrap">
                <span className="text-[var(--term-fg-bright)]">{t.subject}</span>
                <span className="hud-recid">
                  {t.participants}
                  {t.count > 1 && ` · ${t.count} MSGS`}
                </span>
              </span>
              <span className="hud-recid shrink-0">{stamp(t.latest)}</span>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
