import { requireUser, hasOwnerPowers } from "@/lib/session";
import { clearanceDisplay } from "@/lib/clearance";
import {
  OPEN_DEPARTMENTS,
  ALL_DEPARTMENTS,
  isRestrictedDepartment,
} from "@/lib/departments";
import { ProfileForm } from "./profile-form";
import { updateDepartmentAction } from "./actions";

export default async function ProfilePage() {
  const user = await requireUser();
  // Owner-level personnel may freely change to any department; members are
  // locked out of a staff-assigned restricted department.
  const ownerPowers = hasOwnerPowers(user);
  const restrictedLocked =
    !ownerPowers && !!user.department && isRestrictedDepartment(user.department);
  const departmentOptions = ownerPowers ? ALL_DEPARTMENTS : OPEN_DEPARTMENTS;

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: MY PROFILE ::</h1>
      <p className="text-sm text-[var(--term-fg-dim)]">
        NAME: {user.displayName} — CLEARANCE:{" "}
        {clearanceDisplay(user.clearance, user.designation)} — LOGIN:{" "}
        {user.email}
      </p>

      <div className="space-y-2">
        <p className="text-sm text-[var(--term-fg-dim)]">DEPARTMENT:</p>
        {restrictedLocked ? (
          <p className="text-sm">
            <span className="text-[var(--term-amber)]">{user.department}</span>{" "}
            <span className="text-[var(--term-fg-dim)]">
              (assigned by staff — contact administration to change)
            </span>
          </p>
        ) : (
          <form action={updateDepartmentAction} className="flex items-center gap-2">
            <select
              name="department"
              defaultValue={user.department ?? ""}
              className="term-input py-1"
            >
              <option value="">— UNASSIGNED —</option>
              {departmentOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button className="term-button text-xs">SET DEPARTMENT</button>
          </form>
        )}
      </div>

      <p className="text-sm text-[var(--term-fg-dim)]">
        PERSONAL FILE (visible to all personnel via the roster):
      </p>
      <ProfileForm initialContent={user.personalFile} />
    </div>
  );
}
