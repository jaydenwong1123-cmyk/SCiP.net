import { redirect } from "next/navigation";
import { getSiteConfig, hasBypass, isLockedNow } from "@/lib/site-config";
import { BypassForm } from "./bypass-form";
import { Countdown } from "./countdown";

// Depends on live config + cookies; must never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const cfg = await getSiteConfig();

  // Not locked (or the schedule already lapsed), or the visitor already has
  // access — no gate to show.
  if (!isLockedNow(cfg)) redirect("/");
  if (await hasBypass(cfg)) redirect("/");

  const message =
    cfg.maintenanceMessage ||
    "THE NETWORK IS TEMPORARILY OFFLINE FOR A SCHEDULED UPDATE. STAND BY.";

  return (
    <div className="min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--alert">
        ⚠ FACILITY LOCKDOWN IN EFFECT ⚠
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="secure-panel w-full max-w-md space-y-4">
          <div className="alert-stripe" aria-hidden />
          <div className="hud-recid">SCiP-147 // SITE CONTROL</div>
          <h1
            className="text-lg text-[var(--term-amber)]"
            style={{ letterSpacing: "0.18em" }}
          >
            SYSTEM MAINTENANCE
          </h1>
          <p className="text-sm">{message}</p>
          {cfg.lockdownUntil && (
            <div className="hud-readout">
              <span className="hud-readout__label">Auto-unlock in</span>
              <Countdown targetMs={cfg.lockdownUntil.getTime()} />
            </div>
          )}
          <p className="text-[10px] text-[var(--term-fg-dim)]">
            NETWORK ACCESS IS RESTRICTED TO AUTHORIZED PERSONNEL DURING THIS
            WINDOW.
          </p>
          <div className="hud-tick-rule" aria-hidden />
          <BypassForm />
        </div>
      </div>
      <div className="hud-banner hud-banner--ts">
        ALL ACCESS ATTEMPTS ARE LOGGED AND TRACED
      </div>
    </div>
  );
}
