import { requireInsurgent } from "@/lib/session";
import { enforceMaintenance } from "@/lib/site-config";
import { LogoutButton } from "@/components/logout-button";
import { CommandRail } from "@/components/command-rail";
import { CI_SECTIONS } from "@/lib/ci/sections";

export const dynamic = "force-dynamic";

// The Chaos Insurgency field uplink. Deliberately NOT inside the (app) group:
// no TerminalShell, no notifications, no message counts - nothing from the
// member network is rendered or even queried here. The side rail is the same
// CommandRail component the Foundation uses, fed CI's own station list.
export default async function InsurgencyLayout({ children }: { children: React.ReactNode }) {
  await enforceMaintenance();
  const user = await requireInsurgent();

  return (
    <div className="ci-portal hud-shell">
      <CommandRail
        sections={CI_SECTIONS}
        counts={{}}
        facility="CHAOS INSURGENCY"
        callsign="OPERATIVE"
        linkState="UPLINK"
        brandHref="/insurgency"
        mobilePrimary={CI_SECTIONS.map((s) => s.base)}
      />

      <div className="hud-content">
        <div className="hud-banner hud-banner--alert-red flex-wrap">
          <span>CHAOS INSURGENCY</span>
          <span aria-hidden>{"//"}</span>
          <span>FIELD UPLINK</span>
          <span aria-hidden>{"//"}</span>
          <span>{user.displayName}</span>
          <span aria-hidden>{"//"}</span>
          <LogoutButton />
        </div>
        <div className="hud-content__inner">
          <main className="flex-1 flex flex-col gap-[var(--term-gap)] min-w-0">{children}</main>
        </div>
        <div className="hud-banner hud-banner--alert-red flex-wrap">
          <span>[OOC] THIS ACCOUNT HAS NO ACCESS TO THE FOUNDATION NETWORK</span>
        </div>
      </div>
    </div>
  );
}
