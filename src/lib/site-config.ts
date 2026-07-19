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
};

const DEFAULT_CONFIG: SiteConfig = {
  id: SINGLETON,
  maintenanceMode: false,
  bypassCode: "",
  maintenanceMessage: "",
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
  if (!cfg.maintenanceMode) return;
  if (await hasBypass(cfg)) return;
  redirect("/maintenance");
}
