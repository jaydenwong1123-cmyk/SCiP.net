import Link from "next/link";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { canPostBroadcast } from "@/lib/clearance";
import { canEditBroadcast } from "@/lib/doc-permissions";
import { renderBody } from "@/lib/render-body";
import {
  liveBroadcastWhere,
  scheduleState,
  toLocalInputValue,
  formatStamp,
} from "@/lib/broadcast-schedule";
import { BroadcastForm } from "./broadcast-form";
import { deleteBroadcastAction, setBroadcastScheduleAction } from "./actions";

export default async function BroadcastsPage() {
  const user = await requireUser();
  const canManage = hasAdminPowers(user);
  // Single read of the wall clock, shared by the query filter and the
  // per-directive state labels so they can't disagree mid-render.
  const now = new Date();

  // Everyone sees live directives. People who could edit a directive also see
  // its scheduled and expired ones, so a pending notice isn't invisible to
  // the person who scheduled it.
  const canSeeAllSchedules = hasAdminPowers(user) || canPostBroadcast(user.clearance);
  const broadcasts = await db.broadcast.findMany({
    where: canSeeAllSchedules ? undefined : liveBroadcastWhere(now),
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });

  // For privileged viewers, a directive they can't edit should still only show
  // if it's live — being able to post doesn't mean seeing someone else's draft.
  const visible = broadcasts.filter((b) => {
    if (scheduleState(b, now) === "live") return true;
    return canEditBroadcast(user, b);
  });

  // Bodies are rendered up front because cross-link resolution is async and
  // the list is built with a synchronous .map().
  const bodies = new Map(
    await Promise.all(
      visible.map(
        async (b) => [b.id, await renderBody(b.body, user)] as const
      )
    )
  );

  return (
    <div className="space-y-4">
      <div className="term-panel">
        <h1 className="text-lg tracking-widest">:: FOUNDATION BROADCASTS ::</h1>
      </div>

      {canPostBroadcast(user.clearance) && (
        <div className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-fg-dim)]">POST NEW ANNOUNCEMENT</h2>
          <BroadcastForm />
        </div>
      )}

      <div className="space-y-3">
        {visible.length === 0 && (
          <div className="term-panel">
            <div className="empty-state">
              <span className="empty-state__glyph" aria-hidden>
                ✇
              </span>
              <p className="empty-state__title">NO BROADCASTS YET</p>
              <p className="text-sm">
                SITE-WIDE DIRECTIVES WILL APPEAR HERE ONCE ISSUED.
              </p>
            </div>
          </div>
        )}
        {visible.map((b) => {
          const state = scheduleState(b, now);
          return (
          <div
            key={b.id}
            className="term-panel space-y-1"
            // Pending and lapsed directives are visually de-emphasized so they
            // don't read as current standing orders.
            style={state === "live" ? undefined : { opacity: 0.65 }}
          >
            <div className="flex flex-wrap justify-between gap-x-3 text-sm text-[var(--term-fg-dim)]">
              <span>{b.author.displayName}</span>
              <span>
                {b.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                {b.updatedAt && ` — AMENDED (REV ${b.revisionCount})`}
              </span>
            </div>
            {state !== "live" && (
              <p
                className="text-xs"
                style={{
                  color:
                    state === "scheduled"
                      ? "var(--term-amber)"
                      : "var(--term-fg-dim)",
                }}
              >
                {state === "scheduled"
                  ? `⧗ SCHEDULED — GOES LIVE ${formatStamp(b.publishAt!)} UTC (VISIBLE TO YOU ONLY)`
                  : `⊘ STOOD DOWN ${formatStamp(b.expiresAt!)} UTC (VISIBLE TO YOU ONLY)`}
              </p>
            )}
            {state === "live" && b.expiresAt && (
              <p className="text-xs text-[var(--term-fg-dim)]">
                ⧗ STANDS DOWN {formatStamp(b.expiresAt)} UTC
              </p>
            )}
            <p className="font-bold">{b.title}</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">
              {bodies.get(b.id)}
            </pre>
            <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
              {canEditBroadcast(user, b) && (
                <Link href={`/broadcasts/${b.id}/edit`} className="term-link">
                  [AMEND]
                </Link>
              )}
              {b.revisionCount > 0 && (
                <Link href={`/broadcasts/${b.id}/history`} className="term-link">
                  [HISTORY ({b.revisionCount})]
                </Link>
              )}
              {canManage && (
                <form action={deleteBroadcastAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button
                    className="term-button text-xs"
                    style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
                  >
                    [DELETE BROADCAST]
                  </button>
                </form>
              )}
            </div>

            {canEditBroadcast(user, b) && (
              <form
                action={setBroadcastScheduleAction}
                className="flex flex-wrap items-end gap-2 pt-2 border-t border-[var(--term-border)]/30 text-xs"
              >
                <input type="hidden" name="id" value={b.id} />
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--term-fg-dim)]">PUBLISH AT (UTC)</span>
                  <input
                    type="datetime-local"
                    name="publishAt"
                    defaultValue={toLocalInputValue(b.publishAt)}
                    className="term-input py-0.5 text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[var(--term-fg-dim)]">STAND DOWN (UTC)</span>
                  <input
                    type="datetime-local"
                    name="expiresAt"
                    defaultValue={toLocalInputValue(b.expiresAt)}
                    className="term-input py-0.5 text-xs"
                  />
                </label>
                <button className="term-button text-xs">SET SCHEDULE</button>
              </form>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}
