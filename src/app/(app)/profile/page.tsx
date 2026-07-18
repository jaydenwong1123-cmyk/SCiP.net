import { requireUser } from "@/lib/session";
import { clearanceLabel } from "@/lib/clearance";
import { OPEN_DEPARTMENTS, isRestrictedDepartment } from "@/lib/departments";
import { ProfileForm } from "./profile-form";
import { updateDepartmentAction } from "./actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const restrictedLocked = !!user.department && isRestrictedDepartment(user.department);

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: MY PROFILE ::</h1>
      <p className="text-sm text-[var(--term-fg-dim)]">
        NAME: {user.displayName} — CLEARANCE: {clearanceLabel(user.clearance)} — LOGIN:{" "}
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
              {OPEN_DEPARTMENTS.map((d) => (
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
