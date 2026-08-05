"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { deleteHackRunsAction, wipeAllHackRunsAction } from "./actions";
import { RUN_STATUS } from "@/lib/hack/config";
import type { AnonymisedRun } from "@/lib/counter-intel";

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
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2 text-[var(--term-fg-dim)]">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Select all cases"
            />
            SELECT ALL
          </label>
          <span className="text-[var(--term-fg-dim)]">
            {selected.size} SELECTED
          </span>
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
          className="border border-[var(--term-red)]/50 p-2 flex flex-wrap items-center gap-2 text-sm"
        >
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="runIds" value={id} />
          ))}
          <button
            type="submit"
            disabled={deletePending}
            className="term-button hack-button--risk text-xs"
          >
            {deletePending
              ? "DELETING..."
              : `[ DELETE ${selected.size} SELECTED ]`}
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

      <div className="term-panel space-y-1">
        {cases.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__glyph">◇</div>
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
              className="term-row flex flex-1 flex-wrap items-baseline justify-between gap-2"
            >
              <span className="text-sm">
                <span className="text-[var(--term-fg-bright)]">{c.code}</span>
                {c.displayName ? (
                  <span className="text-[var(--term-red)]"> · {c.displayName}</span>
                ) : (
                  <span className="text-[var(--term-fg-dim)]"> · ORIGIN UNKNOWN</span>
                )}
              </span>
              <span className="text-xs text-[var(--term-fg-dim)]">
                {c.startedAtLabel ?? "TIMESTAMP SEALED"}
                {" · TRACE "}
                {c.revealLevel}/{revealMax}
                {c.status === RUN_STATUS.extracted && c.grant && !c.grant.revoked
                  ? " · ACCESS LIVE"
                  : ""}
              </span>
            </Link>
          </div>
        ))}
      </div>

      {canDelete && cases.length > 0 && (
        <div className="term-panel space-y-2">
          {!wipeConfirming ? (
            <button
              type="button"
              onClick={() => setWipeConfirming(true)}
              className="term-button hack-button--risk text-xs"
            >
              [ WIPE ALL CASE FILES ]
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
                  className="term-button hack-button--risk text-xs"
                >
                  {wipePending
                    ? "WIPING..."
                    : "[ CONFIRM WIPE ALL — CANNOT BE UNDONE ]"}
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
