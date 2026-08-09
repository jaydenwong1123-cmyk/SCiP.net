import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const MAINT_COOKIE = "scip-maint-bypass";
const SINGLETON = "singleton";

export type SiteConfig = {
  id: string;
  maintenanceMode: boolean;
  bypassCode: string;
  maintenanceMessage: string;
  // When set, the lockdown lifts on its own once this instant passes. Null =
  // stays locked until an owner disables it manually.
  lockdownUntil: Date | null;
  // OMEGA AUTHORITY — see enforceShutdown() below and lib/omega.ts.
  shutdownMode: boolean;
  shutdownMessage: string;
  shutdownAt: Date | null;
  omegaArmedOp: string | null;
  omegaArmedAt: Date | null;
  omegaArmedBy: string | null;
};

const DEFAULT_CONFIG: SiteConfig = {
  id: SINGLETON,
  maintenanceMode: false,
  bypassCode: "",
  maintenanceMessage: "",
  lockdownUntil: null,
  shutdownMode: false,
  shutdownMessage: "",
  shutdownAt: null,
  omegaArmedOp: null,
  omegaArmedAt: null,
  omegaArmedBy: null,
};

// Read-only fetch of the singleton config. Returns an in-memory default if the
// row doesn't exist yet, so the hot request path never writes. Memoized per
// request so repeated reads within one render share a single query.
export const getSiteConfig = cache(async (): Promise<SiteConfig> => {
  const cfg = await db.siteConfig.findUnique({ where: { id: SINGLETON } });
  return cfg ?? DEFAULT_CONFIG;
});

// Persist config changes (owner-only callers must gate access themselves).
export async function updateSiteConfig(
  data: Partial<Omit<SiteConfig, "id">>
): Promise<void> {
  await db.siteConfig.upsert({
    where: { id: SINGLETON },
    update: data,
    create: { id: SINGLETON, ...data },
  });
}

// Is the site locked down at this instant? True when maintenance is enabled and
// either has no scheduled end or that end is still in the future. A lapsed
// schedule reads as unlocked without anything having to flip the flag.
export function isLockedNow(cfg: SiteConfig): boolean {
  if (!cfg.maintenanceMode) return false;
  if (cfg.lockdownUntil && cfg.lockdownUntil.getTime() <= Date.now()) {
    return false;
  }
  return true;
}

// Does this visitor hold a valid maintenance bypass cookie right now?
export async function hasBypass(cfg: SiteConfig): Promise<boolean> {
  if (!cfg.bypassCode) return false;
  const jar = await cookies();
  return jar.get(MAINT_COOKIE)?.value === cfg.bypassCode;
}

// Gate for server layouts/pages: during maintenance, anyone without a valid
// bypass code is sent to the maintenance notice.
export async function enforceMaintenance(): Promise<void> {
  const cfg = await getSiteConfig();
  if (!isLockedNow(cfg)) return;
  if (await hasBypass(cfg)) return;
  redirect("/maintenance");
}

// The OMEGA shutdown gate. Three things make it harder than maintenance:
//
//   1. No bypass code exists. There is nothing to share, leak, or guess.
//   2. It runs on the unauthenticated layout too, so /login goes dark as well.
//   3. The only way through is being the seeded root owner — checked against
//      the stored row, so a "view as" simulation cannot be used to slip past.
//
// The owner is let through so the panel that lifted the site remains reachable
// to restore it. That is the whole reversibility guarantee, so it must not be
// narrowed to a cookie or a session that could be lost.
export async function enforceShutdown(): Promise<void> {
  const cfg = await getSiteConfig();
  if (!cfg.shutdownMode) return;

  // Imported lazily: lib/session imports this module for enforceMaintenance,
  // and a static import here would close the cycle.
  const { getRealUser } = await import("@/lib/session");
  const user = await getRealUser();
  if (user?.isOwner) return;

  redirect("/terminated");
}
