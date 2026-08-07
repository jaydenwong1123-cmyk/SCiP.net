"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteHackRunsAction, wipeAllHackRunsAction } from "./actions";
import {
  CASE_RESOLUTIONS,
  CASE_RESOLUTION_LABELS,
  CASE_STATUSES,
  CASE_STATUS_LABELS,
  type AnonymisedRun,
} from "@/lib/counter-intel";

function resolutionColor(resolution: AnonymisedRun["resolution"]): string {
  switch (resolution) {
    case CASE_RESOLUTIONS.accessLive:
      return "text-[var(--term-red)]";
    case CASE_RESOLUTIONS.active:
      return "text-[var(--term-amber)]";
    default:
      return "text-[var(--term-fg-dim)]";
  }
}

function caseStatusColor(status: AnonymisedRun["caseStatus"]): string {
  switch (status) {
    case CASE_STATUSES.needsAction:
      return "text-[var(--term-red)]";
    case CASE_STATUSES.inProgress:
      return "text-[var(--term-amber)]";
    case CASE_STATUSES.resolved:
      return "text-[var(--term-fg-dim)]";
    default:
      return "text-[var(--term-fg-dim)]";
  }
}

function CaseBadges({ c }: { c: AnonymisedRun }) {
  return (
    <>
      <span className={resolutionColor(c.resolution)}>
        {CASE_RESOLUTION_LABELS[c.resolution]}
      </span>
      <span className="hud-statusbar__sep" aria-hidden>
        │
      </span>
      <span className={caseStatusColor(c.caseStatus)}>
        {CASE_STATUS_LABELS[c.caseStatus]}
      </span>
      {c.flagged && (
        <span className="text-[var(--term-amber)]">⚑ FLAGGED</span>
      )}
      {c.tracedByName && <span>TRACED BY {c.tracedByName}</span>}
    </>
  );
}

// The reveal ladder as a segmented bar. Paired with the "TRACE n/m" figure
// beside it, so the bar is a second reading of the number rather than the
// only one.
function TraceLadder({ level, max }: { level: number; max: number }) {
  return (
    <span
      className="inline-flex gap-[2px] align-middle"
      aria-label={`Trace ${level} of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className="w-2 h-2 border"
          style={{
            borderColor:
              i < level
                ? "var(--term-fg-bright)"
                : "color-mix(in srgb, var(--term-border) 45%, transparent)",
            background: i < level ? "var(--term-fg-bright)" : "transparent",
          }}
        />
      ))}
    </span>
  );
}

// L-R5 only — see canDeleteCounterIntelLog(). Checkbox selection plus a
// WIPE ALL escape hatch, both gated behind the same designation as the
// per-case DeleteForm on the detail view.
export function CaseList({
  cases,
  revealMax,
  canDelete,
}: {
  cases: AnonymisedRun[];
  revealMax: number;
  canDelete: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteHackRunsAction,
    null
  );
  const [wipeState, wipeAction, wipePending] = useActionState(
    wipeAllHackRunsAction,
    null
  );
  const [wipeConfirming, setWipeConfirming] = useState(false);

  // Drop the selection once a batch lands — the rows it referred to no
  // longer exist, and stale checked ids would invite a second delete.
  const [seenState, setSeenState] = useState(deleteState);
  if (deleteState !== seenState) {
    setSeenState(deleteState);
    if (deleteState?.ok) setSelected(new Set());
  }

  const allSelected = cases.length > 0 && selected.size === cases.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(cases.map((c) => c.id)));
  }

  return (
    <div className="space-y-2">
      {canDelete && cases.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs pb-1">
          <label className="flex items-center gap-2 hud-readout__label">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all cases"
            />
            SELECT ALL
          </label>
          <span className="hud-recid">{selected.size} SELECTED</span>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="term-link"
            >
              [CLEAR]
            </button>
          )}
        </div>
      )}

      {canDelete && selected.size > 0 && (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (
              !confirm(
                `Permanently delete ${selected.size} case file(s)? This cannot be undone.`
              )
            ) {
              e.preventDefault();
            }
          }}
          className="term-panel term-panel--alert p-2 flex flex-wrap items-center gap-2 text-sm"
        >
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="runIds" value={id} />
          ))}
          <button
            type="submit"
            disabled={deletePending}
            className="term-button term-button--danger term-button--sm"
          >
            {deletePending
              ? "DELETING..."
              : `DELETE ${selected.size} SELECTED`}
          </button>
          {deleteState?.error && (
            <p className="basis-full text-xs text-[var(--term-red)]">
              {deleteState.error}
            </p>
          )}
          {deleteState?.ok && deleteState.message && (
            <p className="basis-full text-xs text-[var(--term-fg-dim)]">
              {deleteState.message}
            </p>
          )}
        </form>
      )}

      <div className="hud-list">
        {cases.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__glyph" aria-hidden>
              ◇
            </div>
            <div className="empty-state__title">NO SIGNALS ON RECORD</div>
          </div>
        )}

        {cases.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            {canDelete && (
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                aria-label={`Select ${c.code}`}
              />
            )}
            <Link
              href={`/counter-intel/${c.id}`}
              className="term-row flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1 no-underline px-1"
            >
              <span className="flex items-center gap-2 min-w-0 text-sm">
                <span className="hud-recid text-[var(--term-fg-bright)]">
                  {c.code}
                </span>
                {c.displayName ? (
                  <span className="text-[var(--term-red)]">{c.displayName}</span>
                ) : (
                  <span className="text-[var(--term-fg-dim)]">ORIGIN UNKNOWN</span>
                )}
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[var(--term-fg-dim)]">
                <span className="hud-recid">
                  {c.startedAtLabel ?? "TIMESTAMP SEALED"}
                </span>
                <TraceLadder level={c.revealLevel} max={revealMax} />
                <span className="hud-recid">
                  {c.revealLevel}/{revealMax}
                </span>
                <CaseBadges c={c} />
              </span>
            </Link>
          </div>
        ))}
      </div>

      {canDelete && cases.length > 0 && (
        <div className="term-panel term-panel--sub space-y-2 mt-2">
          {!wipeConfirming ? (
            <button
              type="button"
              onClick={() => setWipeConfirming(true)}
              className="term-button term-button--danger term-button--sm"
            >
              WIPE ALL CASE FILES
            </button>
          ) : (
            <form
              action={wipeAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    "Permanently delete EVERY case file on the desk? This cannot be undone."
                  )
                ) {
                  e.preventDefault();
                }
              }}
              className="space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={wipePending}
                  className="term-button term-button--danger term-button--sm"
                >
                  {wipePending
                    ? "WIPING..."
                    : "CONFIRM WIPE ALL — CANNOT BE UNDONE"}
                </button>
                <button
                  type="button"
                  onClick={() => setWipeConfirming(false)}
                  className="term-link text-xs"
                >
                  [CANCEL]
                </button>
              </div>
              {wipeState?.error && (
                <p className="text-xs text-[var(--term-red)]">{wipeState.error}</p>
              )}
              {wipeState?.ok && wipeState.message && (
                <p className="text-xs text-[var(--term-fg-dim)]">
                  {wipeState.message}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
