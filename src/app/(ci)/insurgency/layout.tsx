import { requireInsurgent } from "@/lib/session";
import { enforceMaintenance } from "@/lib/site-config";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

// The Chaos Insurgency field uplink. Deliberately NOT inside the (app) group:
// no TerminalShell, no command rail, no notifications, no message counts —
// nothing from the member network is rendered or even queried here.
export default async function InsurgencyLayout({ children }: { children: React.ReactNode }) {
  await enforceMaintenance();
  const user = await requireInsurgent();

  return (
    <div className="ci-portal min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--alert-red flex-wrap">
        <span>CHAOS INSURGENCY</span>
        <span aria-hidden>{"//"}</span>
        <span>FIELD UPLINK</span>
        <span aria-hidden>{"//"}</span>
        <span>{user.displayName}</span>
        <span aria-hidden>{"//"}</span>
        <LogoutButton />
      </div>
      <main className="flex-1 w-full max-w-3xl mx-auto p-4 flex flex-col gap-[var(--term-gap)]">
        {children}
      </main>
      <div className="hud-banner hud-banner--alert-red flex-wrap">
        <span>[OOC] THIS ACCOUNT HAS NO ACCESS TO THE FOUNDATION NETWORK</span>
      </div>
    </div>
  );
}
