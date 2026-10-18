import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { canAccessCounterIntel } from "@/lib/counter-intel";
import { ciVisibleTo } from "@/lib/ci/access";
import { isCiSystem, systemSpec } from "@/lib/ci/systems";
import { formatDuration } from "@/lib/hack/config";
import { db } from "@/lib/db";

// Where a member lands when the section they asked for has been taken down by
// a Chaos Insurgency siege. Its own path maps to no system, so the lock can
// never redirect here from here.
export default async function CompromisedPage({
  params,
}: {
  params: Promise<{ system: string }>;
}) {
  const user = await requireUser();
  const { system } = await params;
  const cfg = await getSiteConfig();
  if (!isCiSystem(system) || !ciVisibleTo(user, cfg)) redirect("/menu");

  const now = new Date();
  const lock = await db.ciSiegeSystem.findFirst({
    where: { system, lockedUntil: { gt: now } },
    orderBy: { lockedUntil: "desc" },
  });
  // Restored while they were looking — send them where they were going.
  if (!lock) redirect(systemSpec(system)?.routes[0] ?? "/menu");

  const spec = systemSpec(system)!;
  return (
    <div className="ci-compromised">
      <div className="alert-stripe" aria-hidden />
      <p className="hud-recid">SCiP-NULL {"//"} {spec.code} {"//"} SIGNAL LOST</p>
      <h1 className="ci-compromised__title" data-text="SYSTEM COMPROMISED">
        SYSTEM COMPROMISED
      </h1>
      <p className="text-sm">
        {spec.label} HAS BEEN TAKEN OFFLINE BY HOSTILE ACTION.
      </p>
      <p className="ci-compromised__mark">
        WE ARE THE CHAOS INSURGENCY. YOUR FOUNDATION IS NOT AS SECURE AS IT BELIEVES.
      </p>
      <p className="text-sm text-[var(--term-amber)]">
        AUTOMATIC RESTORATION IN {formatDuration(lock.lockedUntil!.getTime() - now.getTime())}
        {canAccessCounterIntel(user) ? " — OR RESTORE IT NOW." : "."}
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        {canAccessCounterIntel(user) && (
          <Link href="/counter-intel/siege" className="term-button">
            [DEFEND]
          </Link>
        )}
        <Link href="/menu" className="term-link text-sm self-center">
          [RETURN TO MENU]
        </Link>
      </div>
      <div className="alert-stripe" aria-hidden />
    </div>
  );
}
