"use client";

import { useState } from "react";
import {
  setClearanceAction,
  setDisplayNameAction,
  toggleCanPostScpAction,
  toggleStaffAction,
  toggleAdminAction,
  deleteAccountAction,
} from "./actions";

type Member = {
  id: string;
  displayName: string | null;
  clearance: number;
  canPostScp: boolean;
  isAdmin: boolean;
  isStaff: boolean;
};

type Level = { rank: number; label: string };

export function MemberRow({
  member,
  levels,
  canGrantTopClearance,
  canManageStaff,
  canManageAdmin,
}: {
  member: Member;
  levels: Level[];
  canGrantTopClearance: boolean;
  canManageStaff: boolean;
  canManageAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);

  const role = member.isAdmin ? "ADMIN" : member.isStaff ? "STAFF" : null;
  const selectableLevels = canGrantTopClearance
    ? levels
    : levels.filter((l) => l.rank < 7);

  return (
    <div className="border-b border-[var(--term-border)]/30 py-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left text-sm term-link"
      >
        <span className="text-[var(--term-fg-dim)]">{open ? "▾" : "▸"}</span>
        <span className="min-w-[10rem]">
          {member.displayName ?? "(not yet registered)"}
        </span>
        {role && (
          <span className="text-[var(--term-amber)]">[{role}]</span>
        )}
        <span className="ml-auto text-xs text-[var(--term-fg-dim)]">
          {open ? "CLOSE" : "MANAGE"}
        </span>
      </button>

      {open && (
        <div className="flex flex-wrap items-center gap-3 pt-3 pl-5 text-sm">
          <form action={setDisplayNameAction} className="flex items-center gap-2">
            <input type="hidden" name="userId" value={member.id} />
            <input
              type="text"
              name="displayName"
              defaultValue={member.displayName ?? ""}
              placeholder="DISPLAY NAME"
              maxLength={60}
              className="term-input py-1 w-40"
            />
            <button className="term-button text-xs">RENAME</button>
          </form>

          <form action={setClearanceAction} className="flex items-center gap-2">
            <input type="hidden" name="userId" value={member.id} />
            <select
              name="clearance"
              defaultValue={member.clearance}
              className="term-input py-1"
            >
              {selectableLevels.map((l) => (
                <option key={l.rank} value={l.rank}>
                  {l.label}
                </option>
              ))}
            </select>
            <button className="term-button text-xs">SET CLEARANCE</button>
          </form>

          <form action={toggleCanPostScpAction}>
            <input type="hidden" name="userId" value={member.id} />
            <input
              type="hidden"
              name="canPostScp"
              value={(!member.canPostScp).toString()}
            />
            <button className="term-button text-xs">
              {member.canPostScp ? "REVOKE SCP-POST" : "GRANT SCP-POST"}
            </button>
          </form>

          {canManageStaff && (
            <form action={toggleStaffAction}>
              <input type="hidden" name="userId" value={member.id} />
              <input
                type="hidden"
                name="isStaff"
                value={(!member.isStaff).toString()}
              />
              <button
                className="term-button text-xs"
                style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
              >
                {member.isStaff ? "REVOKE STAFF" : "GRANT STAFF"}
              </button>
            </form>
          )}

          {canManageAdmin && (
            <form action={toggleAdminAction}>
              <input type="hidden" name="userId" value={member.id} />
              <input
                type="hidden"
                name="isAdmin"
                value={(!member.isAdmin).toString()}
              />
              <button
                className="term-button text-xs"
                style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
              >
                {member.isAdmin ? "REVOKE ADMIN" : "GRANT ADMIN"}
              </button>
            </form>
          )}

          {canManageStaff && (
            <form
              action={deleteAccountAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Permanently delete ${member.displayName ?? "this account"}? This cannot be undone.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="userId" value={member.id} />
              <button
                className="term-button text-xs"
                style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
              >
                DELETE ACCOUNT
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
