import { requireUser, hasOwnerPowers } from "@/lib/session";
import { clearanceDisplay } from "@/lib/clearance";
import {
  OPEN_DEPARTMENTS,
  ALL_DEPARTMENTS,
  isRestrictedDepartment,
} from "@/lib/departments";
import { ProfileForm } from "./profile-form";
import { updateDepartmentAction } from "./actions";
import { StationHead, HudPanel } from "@/components/hud";

export default async function ProfilePage() {
  const user = await requireUser();
  // Owner-level personnel may freely change to any department; members are
  // locked out of a staff-assigned restricted department.
  const ownerPowers = hasOwnerPowers(user);
  const restrictedLocked =
    !ownerPowers && !!user.department && isRestrictedDepartment(user.department);
  const departmentOptions = ownerPowers ? ALL_DEPARTMENTS : OPEN_DEPARTMENTS;

  // Roles are otherwise invisible to the member holding them, which makes
  // "why can't I do X?" impossible to answer from the account itself.
  const roleLabel = user.isOwner
    ? "OWNER"
    : user.isCoOwner
      ? "CO-OWNER"
      : user.isAdmin
        ? "ADMIN"
        : user.isStaff
          ? "STAFF"
          : user.isHelper
            ? "HELPER"
            : "PERSONNEL";

  return (
    <>
      <StationHead code="USR // PERSONNEL DOSSIER" title="MY PROFILE" />

      <div className="hud-fields">
        <div>
          <div className="hud-readout__label">Name</div>
          <div className="text-sm mt-1 text-[var(--term-fg-bright)]">
            {user.displayName}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Clearance</div>
          <div className="clearance-chip inline-block mt-1 text-xs">
            {clearanceDisplay(user.clearance, user.designation)}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Role</div>
          <div className="text-sm mt-1">{roleLabel}</div>
        </div>
        <div>
          <div className="hud-readout__label">Login</div>
          <div className="hud-recid mt-1">{user.email}</div>
        </div>
      </div>

      <HudPanel code="01" title="ASSIGNMENT">
        <div className="space-y-2">
          <p className="hud-readout__label">DEPARTMENT</p>
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
            <button className="term-button term-button--sm">SET DEPARTMENT</button>
          </form>
        )}
        </div>
      </HudPanel>

      <HudPanel
        code="02"
        title="PERSONAL FILE"
        status="VISIBLE TO ALL PERSONNEL"
      >
        <ProfileForm initialContent={user.personalFile} />
      </HudPanel>
    </>
  );
}
