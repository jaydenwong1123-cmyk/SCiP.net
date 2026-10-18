// Who sees the Chaos Insurgency siege. Client-safe.
//
// The feature ships behind SiteConfig.ciMode so it can be played on the live
// site by a hand-picked group before anyone else knows it exists:
//
//   off    nothing — no enlistment, no launches, no banner, no locks
//   early  only members staff have ticked as early-access testers, CI's own
//          operatives, and the whole of RAISA (the defending side) see or
//          feel any of it
//   live   everyone
//
// Every visible effect — the banner, the defense desk, section locks, the
// defacement, RAISA's alerts — asks ciVisibleTo() first. With the mode on
// "early", a member who is neither a tester nor RAISA sees the site exactly as
// before, even in the middle of a siege.

import { RAISA_DEPARTMENT } from "@/lib/departments";

export const CI_MODES = ["off", "early", "live"] as const;
export type CiMode = (typeof CI_MODES)[number];

export const CI_MODE_LABELS: Record<CiMode, string> = {
  off: "OFF",
  early: "EARLY ACCESS",
  live: "LIVE FOR ALL",
};

export function isCiMode(value: string): value is CiMode {
  return (CI_MODES as readonly string[]).includes(value);
}

// Anything unrecognised reads as off, so a bad value can never switch the
// feature on.
export function ciModeOf(cfg: { ciMode: string }): CiMode {
  return isCiMode(cfg.ciMode) ? cfg.ciMode : "off";
}

export function ciEnabled(cfg: { ciMode: string }): boolean {
  return ciModeOf(cfg) !== "off";
}

export function ciVisibleTo(
  user: {
    earlyAccess?: boolean | null;
    isInsurgent?: boolean | null;
    department?: string | null;
  },
  cfg: { ciMode: string }
): boolean {
  const mode = ciModeOf(cfg);
  if (mode === "off") return false;
  if (mode === "live") return true;
  return !!user.earlyAccess || !!user.isInsurgent || user.department === RAISA_DEPARTMENT;
}
