"use client";

import { useState } from "react";
import {
  setClearanceAction,
  setDisplayNameAction,
  setMemberDepartmentAction,
  toggleCanPostScpAction,
  toggleStaffAction,
  toggleAdminAction,
  toggleCoOwnerAction,
  setSuspendedAction,
  deleteAccountAction,
} from "./actions";
import { ALL_DEPARTMENTS } from "@/lib/departments";
import { CLEARANCE_ASSIGN_OPTIONS, clearanceAssignValue } from "@/lib/clearance";

type Member = {
  id: string;
  displayName: string | null;
  clearance: number;
  designation: string | null;
  canPostScp: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  department: string | null;
  suspended: boolean;
};

export function MemberRow({
  member,
  canGrantTopClearance,
  canManageStaff,
  canManageAdmin,
  canManageCoOwner,
}: {
  member: Member;
  canGrantTopClearance: boolean;
  canManageStaff: boolean;
  canManageAdmin: boolean;
  canManageCoOwner: boolean;
}) {
  const [open, setOpen] = useState(false);

  const role = member.isCoOwner
    ? "CO-OWNER"
    : member.isAdmin
      ? "ADMIN"
      : member.isStaff
        ? "STAFF"
        : null;
  // A co-owner is owner-equivalent: only the seeded owner may touch them, and
  // then only to revoke the role.
  const locked = member.isCoOwner && !canManageCoOwner;
  // L-OMNI (value "7") may only be granted by owner/admin.
  const selectableOptions = CLEARANCE_ASSIGN_OPTIONS.filter(
    (o) => canGrantTopClearance || o.value !== "7"
  );

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
        {member.suspended && (
          <span className="text-[var(--term-red)]">[SUSPENDED]</span>
        )}
        <span className="ml-auto text-xs text-[var(--term-fg-dim)]">
          {open ? "CLOSE" : "MANAGE"}
        </span>
      </button>

      {open && member.isCoOwner && (
        <div className="flex flex-wrap items-center gap-3 pt-3 pl-5 text-sm">
          <p className="text-xs text-[var(--term-fg-dim)]">
            CO-OWNER — OWNER-EQUIVALENT AUTHORITY.
            {locked
              ? " ONLY THE OWNER MAY REVOKE THIS ROLE."
              : " REVOKE THE ROLE TO MANAGE THIS ACCOUNT."}
          </p>
          {canManageCoOwner && (
            <form action={toggleCoOwnerAction}>
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="isCoOwner" value="false" />
              <button
                className="term-button text-xs"
                style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
              >
                REVOKE CO-OWNER
              </button>
            </form>
          )}
        </div>
      )}

      {open && !member.isCoOwner && (
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
              defaultValue={clearanceAssignValue(member.clearance, member.designation)}
              className="term-input py-1"
            >
              {selectableOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button className="term-button text-xs">SET CLEARANCE</button>
          </form>

          <form action={setMemberDepartmentAction} className="flex items-center gap-2">
            <input type="hidden" name="userId" value={member.id} />
            <select
              name="department"
              defaultValue={member.department ?? ""}
              className="term-input py-1"
            >
              <option value="">— NO DEPARTMENT —</option>
              {ALL_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button className="term-button text-xs">SET DEPT</button>
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

          {canManageCoOwner && (
            <form
              action={toggleCoOwnerAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `Make ${member.displayName ?? "this member"} Co-Owner? They gain full owner-level authority, and any current Co-Owner is demoted.`
                  )
                ) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="isCoOwner" value="true" />
              <button
                className="term-button text-xs"
                style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
              >
                GRANT CO-OWNER
              </button>
            </form>
          )}

          {member.suspended ? (
            <form action={setSuspendedAction}>
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="suspend" value="false" />
              <button className="term-button text-xs">REINSTATE</button>
            </form>
          ) : (
            <form action={setSuspendedAction} className="flex items-center gap-2">
              <input type="hidden" name="userId" value={member.id} />
              <input type="hidden" name="suspend" value="true" />
              <input
                type="text"
                name="reason"
                placeholder="REASON (OPTIONAL)"
                maxLength={300}
                className="term-input py-1 w-40"
              />
              <button
                className="term-button text-xs"
                style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
              >
                SUSPEND
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
