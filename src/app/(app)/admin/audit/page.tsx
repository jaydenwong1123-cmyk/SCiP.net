import Link from "next/link";
import { requireStaff } from "@/lib/session";
import { db } from "@/lib/db";
import { AUDIT_ACTION_LABELS } from "@/lib/audit";
import type { Prisma } from "@prisma/client";
import {
  StationHead,
  HudPanel,
  Readout,
  TickRule,
  EmptyState,
} from "@/components/hud";

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

  const seg = (active: boolean) => `hud-seg${active ? " hud-seg--on" : ""}`;

  return (
    <>
      <StationHead code="ADM // AUDIT TRAIL" title="ACCESS &amp; ACTION LOG">
        <Readout label="Entries" value={total} />
        <Link href="/admin" className="term-link text-sm">
          [BACK TO ADMIN]
        </Link>
      </StationHead>

      <HudPanel code="01" title="QUERY" status="LOG FILTER">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="hud-readout__label w-14">ACTION</span>
          <div className="hud-segmented">
            <Link href={qs({ action: null, page: 1 })} className={seg(!activeAction)}>
              ALL
            </Link>
            {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
              <Link
                key={key}
                href={qs({ action: key, page: 1 })}
                className={seg(activeAction === key)}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        {actors.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="hud-readout__label w-14">ACTOR</span>
            <div className="hud-segmented">
              <Link href={qs({ actor: null, page: 1 })} className={seg(!actor)}>
                ALL
              </Link>
              {actors
                .filter((a) => a.actorId)
                .map((a) => (
                  <Link
                    key={a.actorId}
                    href={qs({ actor: a.actorId, page: 1 })}
                    className={seg(actor === a.actorId)}
                  >
                    {a.actorName || "UNKNOWN"}
                  </Link>
                ))}
            </div>
          </div>
        )}
      </HudPanel>

      <HudPanel
        code="02"
        title="LOGGED ACTIONS"
        status={`PAGE ${pageNum} / ${totalPages}`}
      >
        <div className="hud-list">
        {entries.length === 0 && (
          <EmptyState glyph="▦" title="No entries">
            <p className="text-xs">
              {activeAction || actor
                ? "NO LOGGED ACTIONS MATCH THE CURRENT FILTER."
                : "NO PRIVILEGED ACTIONS HAVE BEEN RECORDED YET."}
            </p>
          </EmptyState>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="term-row text-sm flex flex-wrap gap-x-3 gap-y-1 justify-between"
          >
            <span className="min-w-0 break-words">
              <span className="hud-recid mr-2">
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
            {e.ip && <span className="hud-recid shrink-0">{e.ip}</span>}
          </div>
        ))}
        </div>

        {totalPages > 1 && (
          <>
            <TickRule className="mt-3" />
            <div className="flex items-center justify-between text-sm pt-2">
              {pageNum > 1 ? (
                <Link href={qs({ page: pageNum - 1 })} className="term-link">
                  [← NEWER]
                </Link>
              ) : (
                <span className="text-[var(--term-fg-dim)]">[← NEWER]</span>
              )}
              <span className="hud-recid">
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
          </>
        )}
      </HudPanel>
    </>
  );
}
