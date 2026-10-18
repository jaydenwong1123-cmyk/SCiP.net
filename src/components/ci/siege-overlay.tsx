"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { SiegeFeed } from "@/lib/ci/siege-store";
import { systemForPath } from "@/lib/ci/systems";
import { formatClock, useNow, useSiegeFeed } from "./use-siege-feed";

// The siege as the member network sees it: a red banner while it runs, a CI
// propaganda banner while the site is defaced, and an offline notice while a
// system is locked. Mounted in the (app) layout's banner slot for everyone,
// and inert unless /api/siege says this viewer can see a siege — which in
// early access means testers only.
//
// When the section under the viewer falls, this asks the router to refresh;
// the server-side lock in requireUser() then does the actual redirect. The
// client never decides what is locked, it only notices sooner.
export function SiegeOverlay({
  initial,
  isRaisa,
  staffOverride,
}: {
  initial: SiegeFeed | null;
  isRaisa: boolean;
  staffOverride: boolean;
}) {
  const feed = useSiegeFeed(initial);
  const now = useNow(feed?.serverNow ?? initial?.serverNow);
  const pathname = usePathname();
  const router = useRouter();

  const defaced = !!feed?.defacedUntil && feed.defacedUntil > now;

  useEffect(() => {
    const root = document.documentElement;
    if (defaced) root.dataset.ciDefaced = "1";
    else delete root.dataset.ciDefaced;
    return () => {
      delete root.dataset.ciDefaced;
    };
  }, [defaced]);

  // Has the section under us just gone down? Refresh once per fall.
  const here = systemForPath(pathname);
  const hereDown =
    !!here &&
    (!!feed?.active?.systems.some((s) => s.id === here && s.fallen) ||
      !!feed?.locked.some((l) => l.id === here && l.lockedUntil > now));
  const refreshedFor = useRef<string | null>(null);
  useEffect(() => {
    if (staffOverride || !hereDown) {
      refreshedFor.current = null;
      return;
    }
    const key = `${pathname}`;
    if (refreshedFor.current === key) return;
    refreshedFor.current = key;
    router.refresh();
  }, [hereDown, staffOverride, pathname, router]);

  if (!feed) return null;
  const tag = feed.earlyAccess ? " [EARLY ACCESS]" : "";
  const locked = feed.locked.filter((l) => l.lockedUntil > now);

  return (
    <>
      {feed.active && (
        <div className="hud-banner hud-banner--alert-red flex-wrap">
          <span>
            ⚠ NETWORK UNDER ATTACK — CHAOS INSURGENCY SIEGE — {formatClock(feed.active.endsAt - now)}
            {tag}
          </span>
          <span className="ci-mini-bars" aria-label="System integrity">
            {feed.active.systems.map((s) => (
              <span key={s.id} className="ci-mini-bars__item" title={`${s.label} ${s.integrity}/${s.max}`}>
                {s.code}
                <i style={{ ["--pct" as string]: `${Math.round((s.integrity / s.max) * 100)}%` }} />
              </span>
            ))}
          </span>
          {isRaisa && (
            <Link href="/counter-intel/siege" className="term-link">
              [DEFEND]
            </Link>
          )}
        </div>
      )}
      {defaced && (
        <div className="hud-banner hud-banner--alert-red ci-propaganda flex-wrap">
          <span>
            ☩ THIS NETWORK BELONGS TO THE CHAOS INSURGENCY. YOUR SECRETS ARE OURS.{tag}
          </span>
        </div>
      )}
      {!feed.active && locked.length > 0 && (
        <div className="hud-banner hud-banner--alert flex-wrap">
          <span>
            ⚠ OFFLINE: {locked.map((l) => `${l.label} (${formatClock(l.lockedUntil - now)})`).join(", ")}
            {staffOverride && " — STAFF OVERRIDE, YOU CAN STILL ENTER"}
            {tag}
          </span>
          {isRaisa && (
            <Link href="/counter-intel/siege" className="term-link">
              [RESTORE]
            </Link>
          )}
        </div>
      )}
    </>
  );
}
