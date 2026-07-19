import { redirect } from "next/navigation";
import { getSiteConfig, hasBypass } from "@/lib/site-config";
import { BypassForm } from "./bypass-form";

// Depends on live config + cookies; must never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const cfg = await getSiteConfig();

  // Not in maintenance, or the visitor already has access — no gate to show.
  if (!cfg.maintenanceMode) redirect("/");
  if (await hasBypass(cfg)) redirect("/");

  const message =
    cfg.maintenanceMessage ||
    "THE NETWORK IS TEMPORARILY OFFLINE FOR A SCHEDULED UPDATE. STAND BY.";

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="term-panel w-full max-w-md space-y-4">
        <h1 className="text-lg tracking-widest text-[var(--term-amber)]">
          :: SYSTEM MAINTENANCE ::
        </h1>
        <p className="text-sm">{message}</p>
        <p className="text-xs text-[var(--term-fg-dim)]">
          NETWORK ACCESS IS RESTRICTED TO AUTHORIZED PERSONNEL DURING THIS
          WINDOW.
        </p>
        <div className="border-t border-[var(--term-border)]/40 pt-3">
          <BypassForm />
        </div>
      </div>
    </div>
  );
}
