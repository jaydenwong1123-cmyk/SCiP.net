"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SiegeFeed } from "@/lib/ci/siege-store";
import { SIEGE_ACTIVE_POLL_MS, SIEGE_IDLE_POLL_MS } from "@/lib/ci/config";

// One poll loop over /api/siege, shared by the banner, the CI portal and the
// RAISA desk. Seeded from the server render so a page that lands mid-siege
// paints with the banner already up.
//
// The feed lives in a module-level store rather than in each component, so
// the overlay and the console on the same page read the same numbers from a
// single loop instead of running two timers that disagree. A siege action
// pushes the feed it got back straight into the store (pushSiegeFeed), which
// is what makes the integrity bars move the moment the answer lands rather
// than on the next poll.
//
// Same rules as the memetic overlay's loop: skip requests while the tab is
// hidden, never tear state down on a network blip (only on an explicit 204),
// and poll faster while something is happening. A request that hangs is
// aborted, and the next tick is always scheduled, so one stalled poll can
// never freeze the board until a reload.

const REQUEST_TIMEOUT_MS = 6000;

type Snapshot = { feed: SiegeFeed | null };

let snapshot: Snapshot = { feed: null };
let seeded = false;
const listeners = new Set<() => void>();

let subscribers = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: AbortController | null = null;
// Bumped by every write. A poll that started before a newer write lands drops
// its result instead of rolling the board back.
let version = 0;

function emit(feed: SiegeFeed | null) {
  snapshot = { feed };
  for (const l of listeners) l();
}

function nextDelay(): number {
  return snapshot.feed?.active ? SIEGE_ACTIVE_POLL_MS : SIEGE_IDLE_POLL_MS;
}

function schedule(delay = nextDelay()) {
  clearTimeout(timer);
  if (subscribers > 0) timer = setTimeout(tick, delay);
}

async function tick() {
  if (subscribers === 0) return;
  if (document.visibilityState !== "visible") {
    schedule();
    return;
  }
  inflight?.abort();
  const controller = new AbortController();
  inflight = controller;
  const killer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = version;
  try {
    const res = await fetch("/api/siege", { cache: "no-store", signal: controller.signal });
    if (started === version) {
      if (res.status === 200) {
        version++;
        emit((await res.json()) as SiegeFeed);
      } else if (res.status === 204) {
        version++;
        emit(null);
      }
    }
  } catch {
    // Keep what we have.
  } finally {
    clearTimeout(killer);
    if (inflight === controller) inflight = null;
    schedule();
  }
}

function onVisible() {
  if (document.visibilityState === "visible") void refreshSiegeFeed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  subscribers++;
  if (subscribers === 1) {
    document.addEventListener("visibilitychange", onVisible);
    schedule();
  }
  return () => {
    listeners.delete(listener);
    subscribers--;
    if (subscribers === 0) {
      clearTimeout(timer);
      inflight?.abort();
      inflight = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

/** Replace the feed with one a siege action just returned, and restart the clock. */
export function pushSiegeFeed(feed: SiegeFeed | null) {
  version++;
  inflight?.abort();
  emit(feed);
  schedule();
}

/** Poll now instead of waiting for the next tick. */
export function refreshSiegeFeed(): Promise<void> {
  clearTimeout(timer);
  return tick();
}

// The first server render to arrive seeds the store; later mounts (the console
// under an overlay that already seeded it) only take their initial value if it
// is newer than what the store holds. Browser only: on the server this module
// is shared by every request, so it must never hold anyone's feed.
function seed(initial: SiegeFeed | null) {
  if (typeof window === "undefined") return;
  if (!seeded) {
    seeded = true;
    snapshot = { feed: initial };
  } else if (initial && (!snapshot.feed || initial.serverNow > snapshot.feed.serverNow)) {
    snapshot = { feed: initial };
  }
}

export function useSiegeFeed(initial: SiegeFeed | null): SiegeFeed | null {
  const [serverSnapshot] = useState<Snapshot>(() => {
    seed(initial);
    return { feed: initial };
  });
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => serverSnapshot
  );
  return state.feed;
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
