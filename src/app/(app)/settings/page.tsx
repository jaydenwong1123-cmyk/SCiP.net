import { requireUser, getRealUser } from "@/lib/session";
import { SettingsForm } from "./settings-form";
import { NotificationPreferencesForm } from "./notification-preferences-form";
import { getNotificationPreferences } from "@/lib/notifications";
import { clearanceDisplay, clearanceLabel } from "@/lib/clearance";
import { canViewAs, getViewAsClearance, viewAsOptions } from "@/lib/view-as";
import { setViewAsAction } from "./view-as-actions";
import { StationHead, HudPanel, Readout, Lamp } from "@/components/hud";

export default async function SettingsPage() {
  await requireUser();
  // The real row, not the simulated persona — this page is how a member gets
  // back out of a simulation, so it must never be downgraded.
  const real = (await getRealUser())!;
  const viewAs = await getViewAsClearance(real);
  const notificationPreferences = await getNotificationPreferences(real.id);

  return (
    <>
      <StationHead code="CFG // TERMINAL CONFIGURATION" title="SETTINGS">
        <Readout
          label="Session"
          value={clearanceDisplay(real.clearance, real.designation)}
          small
        />
        {canViewAs(real) && (
          <div className="hud-readout">
            <span className="hud-readout__label">Simulation</span>
            <Lamp state={viewAs !== null ? "warn" : "off"}>
              {viewAs !== null ? `AS ${clearanceLabel(viewAs)}` : "INACTIVE"}
            </Lamp>
          </div>
        )}
      </StationHead>

      <HudPanel code="01" title="DISPLAY" status="THIS BROWSER ONLY">
        <SettingsForm />
      </HudPanel>

      <HudPanel code="02" title="NOTIFICATION PREFERENCES">
        <NotificationPreferencesForm preferences={notificationPreferences} />
      </HudPanel>

      {canViewAs(real) && (
        <HudPanel
          code="03"
          title="CLEARANCE SIMULATION"
          status={viewAs !== null ? "ACTIVE" : "INACTIVE"}
          variant={viewAs !== null ? "alert" : undefined}
        >
          <p className="text-xs text-[var(--term-fg-dim)] mb-2">
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
            <button className="term-button term-button--sm">APPLY</button>
          </form>
          {viewAs !== null && (
            <form action={setViewAsAction} className="pt-2">
              <input type="hidden" name="clearance" value="" />
              <button className="term-button term-button--danger term-button--sm">
                END SIMULATION
              </button>
            </form>
          )}
        </HudPanel>
      )}
    </>
  );
}
