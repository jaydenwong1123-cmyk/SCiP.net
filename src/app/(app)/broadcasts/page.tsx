import Link from "next/link";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { canPostBroadcast, authoringClearance } from "@/lib/clearance";
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
import {
  StationHead,
  HudPanel,
  Readout,
  Lamp,
  EmptyState,
} from "@/components/hud";

export default async function BroadcastsPage() {
  const user = await requireUser();
  const canManage = hasAdminPowers(user);
  // Single read of the wall clock, shared by the query filter and the
  // per-directive state labels so they can't disagree mid-render.
  const now = new Date();

  // Everyone sees live directives. People who could edit a directive also see
  // its scheduled and expired ones, so a pending notice isn't invisible to
  // the person who scheduled it.
  const canSeeAllSchedules = hasAdminPowers(user) || canPostBroadcast(authoringClearance(user));
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

  const liveCount = visible.filter((b) => scheduleState(b, now) === "live").length;

  return (
    <>
      <StationHead code="SEC-05 // SITE DIRECTIVES" title="FOUNDATION BROADCASTS">
        <Readout label="Standing" value={liveCount} />
        {visible.length !== liveCount && (
          <Readout
            label="Pending / Lapsed"
            value={visible.length - liveCount}
            tone="dim"
            small
          />
        )}
      </StationHead>

      {canPostBroadcast(authoringClearance(user)) && (
        <HudPanel code="01" title="ISSUE DIRECTIVE" status="SITE-WIDE">
          <BroadcastForm />
        </HudPanel>
      )}

      <div className="flex flex-col gap-[var(--term-gap)]">
        {visible.length === 0 && (
          <HudPanel code="02" title="DIRECTIVE LOG">
            <EmptyState glyph="✇" title="No broadcasts yet">
              <p className="text-xs">
                SITE-WIDE DIRECTIVES WILL APPEAR HERE ONCE ISSUED.
              </p>
            </EmptyState>
          </HudPanel>
        )}
        {visible.map((b, i) => {
          const state = scheduleState(b, now);
          return (
          <div
            key={b.id}
            className="term-panel space-y-1"
            // Pending and lapsed directives are visually de-emphasized so they
            // don't read as current standing orders.
            style={state === "live" ? undefined : { opacity: 0.65 }}
          >
            <div className="hud-panel-head">
              <span className="hud-panel-head__code">
                DIR-{String(i + 1).padStart(3, "0")}
              </span>
              <span>{b.title}</span>
              <span className="hud-panel-head__status">
                <Lamp
                  state={
                    state === "live" ? "on" : state === "scheduled" ? "warn" : "off"
                  }
                >
                  {state === "live"
                    ? "STANDING"
                    : state === "scheduled"
                      ? "SCHEDULED"
                      : "STOOD DOWN"}
                </Lamp>
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 text-xs">
              <span className="hud-recid">{b.author.displayName}</span>
              <span className="hud-recid">
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
            <pre className="whitespace-pre-wrap break-words font-mono text-sm pt-1">
              {bodies.get(b.id)}
            </pre>
            <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
              {canEditBroadcast(user, b) && (
                <Link href={`/broadcasts/${b.id}/edit`} className="term-link">
                  [EDIT]
                </Link>
              )}
              {canManage && b.revisionCount > 0 && (
                <Link href={`/broadcasts/${b.id}/history`} className="term-link">
                  [HISTORY ({b.revisionCount})]
                </Link>
              )}
              {canManage && (
                <form action={deleteBroadcastAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="term-button term-button--danger term-button--sm">
                    DELETE BROADCAST
                  </button>
                </form>
              )}
            </div>

            {canEditBroadcast(user, b) && (
              <form
                action={setBroadcastScheduleAction}
                className="flex flex-wrap items-end gap-2 pt-2 border-t border-[var(--hud-line-soft)] text-xs"
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
                <button className="term-button term-button--sm">SET SCHEDULE</button>
              </form>
            )}
          </div>
          );
        })}
      </div>
    </>
  );
}
