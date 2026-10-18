import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSiteConfig } from "@/lib/site-config";
import { ciVisibleTo } from "./access";
import { systemForPath, systemLabel, type CiSystemId } from "./systems";
import { getLockedSystemIds } from "./siege-store";

// Section locks — what a fallen system actually does to the site.
//
// The path comes from the x-scip-path header that proxy.ts stamps on every
// request (overwriting anything a client sent), because a layout never learns
// its pathname and a page would otherwise have to pass its own. Called from
// requireUser(), so every page and server action behind it is covered.
//
// Costs nothing on the normal path: the SiteConfig row is already cached for
// the request, and unless its lock-horizon hint is in the future there can be
// no lock to find.

type LockUser = {
  earlyAccess?: boolean | null;
  isInsurgent?: boolean | null;
  department?: string | null;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
};

// Staff walk through a lock (with the banner telling them it is down) so that
// moderation never stops because of a roleplay event.
function bypassesLock(user: LockUser): boolean {
  return user.isOwner || user.isCoOwner || user.isAdmin || user.isStaff;
}

async function lockedSystemsFor(user: LockUser): Promise<Set<string> | null> {
  const cfg = await getSiteConfig();
  const now = new Date();
  if (!cfg.ciLockHorizon || cfg.ciLockHorizon.getTime() <= now.getTime()) return null;
  if (!ciVisibleTo(user, cfg)) return null;
  if (bypassesLock(user)) return null;
  return getLockedSystemIds(now);
}

export async function enforceSystemOnline(user: LockUser): Promise<void> {
  const locked = await lockedSystemsFor(user);
  if (!locked || locked.size === 0) return;
  let pathname: string | null = null;
  try {
    pathname = (await headers()).get("x-scip-path");
  } catch {
    return;
  }
  const system = systemForPath(pathname);
  if (system && locked.has(system)) redirect(`/compromised/${system}`);
}

/**
 * For write actions that can be invoked from another section's page — the
 * path header would name the wrong section there. Returns the refusal to show,
 * or null when the system is up.
 */
export async function systemOfflineError(
  user: LockUser,
  system: CiSystemId
): Promise<string | null> {
  const locked = await lockedSystemsFor(user);
  if (!locked || !locked.has(system)) return null;
  return `${systemLabel(system)} IS OFFLINE — COMPROMISED BY HOSTILE ACTION.`;
}
