"use client";

import { useEffect, useRef, useState } from "react";
import type { SiegeFeed } from "@/lib/ci/siege-store";
import { SIEGE_ACTIVE_POLL_MS, SIEGE_IDLE_POLL_MS } from "@/lib/ci/config";

// One poll loop over /api/siege, shared by the banner, the CI portal and the
// RAISA desk. Seeded from the server render so a page that lands mid-siege
// paints with the banner already up.
//
// Same rules as the memetic overlay's loop: skip requests while the tab is
// hidden, never tear state down on a network blip (only on an explicit 204),
// and poll faster while something is happening.
export function useSiegeFeed(initial: SiegeFeed | null): SiegeFeed | null {
  const [feed, setFeed] = useState<SiegeFeed | null>(initial);
  const activeRef = useRef(!!initial?.active);
  useEffect(() => {
    activeRef.current = !!feed?.active;
  }, [feed]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (cancelled) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/siege", { cache: "no-store" });
          if (!cancelled) {
            if (res.status === 200) setFeed((await res.json()) as SiegeFeed);
            else if (res.status === 204) setFeed(null);
          }
        } catch {
          // Keep what we have.
        }
      }
      if (!cancelled) {
        timer = setTimeout(tick, activeRef.current ? SIEGE_ACTIVE_POLL_MS : SIEGE_IDLE_POLL_MS);
      }
    }

    timer = setTimeout(tick, activeRef.current ? SIEGE_ACTIVE_POLL_MS : SIEGE_IDLE_POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return feed;
}

// Seconds-resolution clock for countdowns, corrected for the server's offset.
export function useNow(serverNow: number | undefined, periodMs = 1000): number {
  const [skew] = useState(() => (serverNow ? Date.now() - serverNow : 0));
  const [now, setNow] = useState(() => Date.now() - skew);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() - skew), periodMs);
    return () => clearInterval(id);
  }, [skew, periodMs]);
  return now;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
