import { redirect } from "next/navigation";
import { getSiteConfig } from "@/lib/site-config";

// Reads live config on every request — a restoration must take effect at once.
export const dynamic = "force-dynamic";

// The public face of an OMEGA termination.
//
// Modelled on the maintenance notice, with one deliberate omission: there is no
// bypass form. A maintenance lockdown is a door with a key; this is not a door.
// The only way back is the overseer restoring the network.
export default async function TerminatedPage() {
  const cfg = await getSiteConfig();
  if (!cfg.shutdownMode) redirect("/");

  const message =
    cfg.shutdownMessage ||
    "THIS NETWORK HAS BEEN TERMINATED BY ORDER OF THE OVERSEER. NO FURTHER ACCESS WILL BE GRANTED.";

  return (
    <div className="min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--alert-red">
        ⚠ NETWORK TERMINATED ⚠
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="secure-panel w-full max-w-md space-y-4">
          <div className="alert-stripe" aria-hidden />
          <div className="hud-recid">SCiP-147 // OMEGA</div>
          <h1
            className="text-lg text-[var(--term-red)]"
            style={{ letterSpacing: "0.18em" }}
          >
            SERVICE TERMINATED
          </h1>
          <p className="text-sm">{message}</p>
          <div className="hud-tick-rule" aria-hidden />
          <p className="text-[10px] text-[var(--term-fg-dim)]">
            ALL TERMINALS HAVE BEEN DISCONNECTED. CREDENTIALS ARE NO LONGER
            ACCEPTED AT THIS SITE.
          </p>
        </div>
      </div>
      <div className="hud-banner hud-banner--ts">
        ALL ACCESS ATTEMPTS ARE LOGGED AND TRACED
      </div>
    </div>
  );
}
