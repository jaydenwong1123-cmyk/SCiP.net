import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/db";
import { AUDIT_ACTION_LABELS } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; actor?: string; page?: string }>;
}) {
  await requireStaff();
  const { action, actor, page: pageParam } = await searchParams;

  const pageNum = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const activeAction =
    action && action in AUDIT_ACTION_LABELS ? action : null;

  const where: Prisma.AuditLogWhereInput = {
    ...(activeAction ? { action: activeAction } : {}),
    ...(actor ? { actorId: actor } : {}),
  };

  const [entries, total, actors] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    // Distinct actors present in the log, for the filter dropdown.
    db.auditLog.findMany({
      distinct: ["actorId"],
      select: { actorId: true, actorName: true },
      orderBy: { actorName: "asc" },
      take: 100,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (next: { action?: string | null; actor?: string | null; page?: number }) => {
    const params = new URLSearchParams();
    const a = next.action === undefined ? activeAction : next.action;
    const ac = next.actor === undefined ? (actor ?? null) : next.actor;
    if (a) params.set("action", a);
    if (ac) params.set("actor", ac);
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const s = params.toString();
    return s ? `/admin/audit?${s}` : "/admin/audit";
  };

  const chip = (active: boolean) =>
    `text-xs px-2 py-0.5 border term-link ${
      active
        ? "border-[var(--term-fg-bright)] text-[var(--term-fg-bright)]"
        : "border-[var(--term-border)]/50"
    }`;

  return (
    <div className="space-y-4">
      <div className="term-panel flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: ACCESS &amp; ACTION LOG ::</h1>
        <Link href="/admin" className="term-link text-sm">
          [BACK TO ADMIN]
        </Link>
      </div>

      <div className="term-panel space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--term-fg-dim)] w-16">ACTION:</span>
          <Link href={qs({ action: null, page: 1 })} className={chip(!activeAction)}>
            ALL
          </Link>
          {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
            <Link
              key={key}
              href={qs({ action: key, page: 1 })}
              className={chip(activeAction === key)}
            >
              {label}
            </Link>
          ))}
        </div>
        {actors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[var(--term-fg-dim)] w-16">ACTOR:</span>
            <Link href={qs({ actor: null, page: 1 })} className={chip(!actor)}>
              ALL
            </Link>
            {actors
              .filter((a) => a.actorId)
              .map((a) => (
                <Link
                  key={a.actorId}
                  href={qs({ actor: a.actorId, page: 1 })}
                  className={chip(actor === a.actorId)}
                >
                  {a.actorName || "UNKNOWN"}
                </Link>
              ))}
          </div>
        )}
      </div>

      <div className="term-panel space-y-1">
        {entries.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__glyph" aria-hidden>
              ▦
            </span>
            <p className="empty-state__title">NO ENTRIES</p>
            <p className="text-sm">
              {activeAction || actor
                ? "NO LOGGED ACTIONS MATCH THE CURRENT FILTER."
                : "NO PRIVILEGED ACTIONS HAVE BEEN RECORDED YET."}
            </p>
          </div>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="term-row border-b border-[var(--term-border)]/30 text-sm flex flex-wrap gap-x-3 gap-y-1 justify-between"
          >
            <span className="min-w-0 break-words">
              <span className="text-[var(--term-fg-dim)] text-xs mr-2">
                {e.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
              <span className="text-[var(--term-fg-bright)]">{e.actorName}</span>{" "}
              <span className="text-[var(--term-fg-dim)]">
                {AUDIT_ACTION_LABELS[e.action] ?? e.action}
              </span>
              {e.targetName && (
                <>
                  {" → "}
                  <span>{e.targetName}</span>
                </>
              )}
              {e.summary && (
                <span className="block text-xs text-[var(--term-fg-dim)] mt-0.5">
                  {e.summary}
                </span>
              )}
            </span>
            {e.ip && (
              <span className="text-[10px] text-[var(--term-fg-dim)] shrink-0">
                {e.ip}
              </span>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="term-panel flex items-center justify-between text-sm">
          {pageNum > 1 ? (
            <Link href={qs({ page: pageNum - 1 })} className="term-link">
              [← NEWER]
            </Link>
          ) : (
            <span className="text-[var(--term-fg-dim)]">[← NEWER]</span>
          )}
          <span className="text-[var(--term-fg-dim)]">
            PAGE {pageNum} / {totalPages} — {total} ENTRIES
          </span>
          {pageNum < totalPages ? (
            <Link href={qs({ page: pageNum + 1 })} className="term-link">
              [OLDER →]
            </Link>
          ) : (
            <span className="text-[var(--term-fg-dim)]">[OLDER →]</span>
          )}
        </div>
      )}
    </div>
  );
}
