import { requireUser, getRealUser } from "@/lib/session";
import { SettingsForm } from "./settings-form";
import { clearanceDisplay, clearanceLabel } from "@/lib/clearance";
import { canViewAs, getViewAsClearance, viewAsOptions } from "@/lib/view-as";
import { setViewAsAction } from "./view-as-actions";

export default async function SettingsPage() {
  await requireUser();
  // The real row, not the simulated persona — this page is how a member gets
  // back out of a simulation, so it must never be downgraded.
  const real = (await getRealUser())!;
  const viewAs = await getViewAsClearance(real);

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: DISPLAY SETTINGS ::</h1>
      <p className="text-sm text-[var(--term-fg-dim)]">
        CUSTOMIZE THE TERMINAL APPEARANCE FOR YOUR SESSION.
      </p>
      <SettingsForm />

      {canViewAs(real) && (
        <div className="space-y-2 border-t border-[var(--term-border)] pt-4">
          <h2 className="text-sm tracking-widest">:: CLEARANCE SIMULATION ::</h2>
          <p className="text-xs text-[var(--term-fg-dim)]">
            BROWSE THE SITE AS LOWER-CLEARANCE PERSONNEL WOULD SEE IT. WHILE
            ACTIVE, YOUR ELEVATED ROLES AND REDACTION BYPASS ARE SUSPENDED. YOUR
            ACTUAL CLEARANCE IS{" "}
            {clearanceDisplay(real.clearance, real.designation)}.
          </p>
          <form action={setViewAsAction} className="flex items-center gap-2">
            <select
              name="clearance"
              defaultValue={viewAs === null ? "" : String(viewAs)}
              className="term-input py-1"
            >
              <option value="">— NO SIMULATION (FULL ACCESS) —</option>
              {viewAsOptions(real.clearance).map((rank) => (
                <option key={rank} value={rank}>
                  VIEW AS {clearanceLabel(rank)}
                </option>
              ))}
            </select>
            <button className="term-button text-xs">APPLY</button>
          </form>
        </div>
      )}
    </div>
  );
}
