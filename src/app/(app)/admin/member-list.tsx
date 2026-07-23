"use client";

import { useActionState, useMemo, useState } from "react";
import { MemberRow } from "./member-row";
import { bulkMemberAction } from "./actions";
import { ALL_DEPARTMENTS } from "@/lib/departments";
import { CLEARANCE_ASSIGN_OPTIONS } from "@/lib/clearance";
import {
  BULK_OPS,
  BULK_OP_LABELS,
  ADMIN_ONLY_BULK_OPS,
  DESTRUCTIVE_BULK_OPS,
  type BulkOp,
} from "@/lib/bulk-ops";

type Member = {
  id: string;
  displayName: string | null;
  clearance: number;
  designation: string | null;
  canPostScp: boolean;
  canFileIncident: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isHelper: boolean;
  department: string | null;
  suspended: boolean;
};

export function MemberList({
  members,
  canGrantTopClearance,
  canManageStaff,
  canManageAdmin,
  canManageCoOwner,
  canManageHelper,
  hasAdminPowers,
}: {
  members: Member[];
  canGrantTopClearance: boolean;
  canManageStaff: boolean;
  canManageAdmin: boolean;
  canManageCoOwner: boolean;
  canManageHelper: boolean;
  hasAdminPowers: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [op, setOp] = useState<BulkOp>("clearance");
  const [state, formAction, pending] = useActionState(bulkMemberAction, null);

  // A co-owner is owner-equivalent and is never a valid bulk target — the
  // server skips them regardless, so don't offer the checkbox either.
  const selectable = useMemo(
    () => members.filter((m) => !m.isCoOwner),
    [members]
  );

  // Drop the selection once a batch lands: the rows it referred to may no
  // longer exist, and leaving stale ids checked invites a second, unintended
  // application. Adjusted during render rather than from an effect, which is
  // the supported way to respond to a changed value without a second pass.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setSelected(new Set());
  }

  const availableOps = BULK_OPS.filter(
    (o) => hasAdminPowers || !ADMIN_ONLY_BULK_OPS.includes(o)
  );

  const clearanceOptions = CLEARANCE_ASSIGN_OPTIONS.filter((o) =>
    canGrantTopClearance ? true : o.rank <= 3
  );

  const allSelected =
    selectable.length > 0 && selected.size === selectable.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map((m) => m.id)));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 text-[var(--term-fg-dim)]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Select all members"
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

      {selected.size > 0 && (
        <form
          action={formAction}
          onSubmit={(e) => {
            if (
              DESTRUCTIVE_BULK_OPS.includes(op) &&
              !confirm(
                op === "delete"
                  ? `Permanently delete ${selected.size} account(s)? This cannot be undone.`
                  : `Suspend ${selected.size} member(s)? They lose access immediately.`
              )
            ) {
              e.preventDefault();
            }
          }}
          className="border border-[var(--term-amber)]/50 p-2 flex flex-wrap items-end gap-2 text-sm"
        >
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="userIds" value={id} />
          ))}

          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--term-fg-dim)]">
              BULK OPERATION
            </span>
            <select
              name="op"
              value={op}
              onChange={(e) => setOp(e.target.value as BulkOp)}
              className="term-input py-1"
            >
              {availableOps.map((o) => (
                <option key={o} value={o}>
                  {BULK_OP_LABELS[o]}
                </option>
              ))}
            </select>
          </label>

          {op === "clearance" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--term-fg-dim)]">LEVEL</span>
              <select name="clearance" className="term-input py-1">
                {clearanceOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {op === "department" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--term-fg-dim)]">DEPARTMENT</span>
              <select name="department" className="term-input py-1">
                <option value="">— NO DEPARTMENT —</option>
                {ALL_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          {op === "suspend" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--term-fg-dim)]">
                REASON (OPTIONAL)
              </span>
              <input
                type="text"
                name="reason"
                maxLength={300}
                className="term-input py-1 w-56"
              />
            </label>
          )}

          <button
            type="submit"
            disabled={pending}
            className="term-button text-xs"
            style={
              DESTRUCTIVE_BULK_OPS.includes(op)
                ? { borderColor: "var(--term-red)", color: "var(--term-red)" }
                : undefined
            }
          >
            {pending ? "APPLYING..." : `APPLY TO ${selected.size}`}
          </button>

          <p className="basis-full text-[10px] text-[var(--term-fg-dim)]">
            THE OWNER AND CO-OWNER ARE NEVER AFFECTED. EACH MEMBER CHANGED IS
            RECORDED INDIVIDUALLY IN THE ACTION LOG.
          </p>

          {state?.error && (
            <p
              className="basis-full text-xs"
              style={{ color: "var(--term-red)" }}
              role="alert"
            >
              {state.error}
            </p>
          )}
          {state?.ok && state.message && (
            <p className="basis-full text-xs text-[var(--term-fg-dim)]">
              {state.message}
            </p>
          )}
        </form>
      )}

      <div>
        {members.map((m) => (
          <div key={m.id} className="flex items-start gap-2">
            <div className="pt-3">
              {m.isCoOwner ? (
                // Placeholder keeps the rows aligned where no checkbox belongs.
                <span className="inline-block w-[13px]" aria-hidden="true" />
              ) : (
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  aria-label={`Select ${m.displayName ?? "member"}`}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <MemberRow
                member={m}
                canGrantTopClearance={canGrantTopClearance}
                canManageStaff={canManageStaff}
                canManageAdmin={canManageAdmin}
                canManageCoOwner={canManageCoOwner}
                canManageHelper={canManageHelper}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
