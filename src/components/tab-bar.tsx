"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";

// Section routes that can be opened as tabs. Sub-paths (e.g. /scp/123) collapse
// into their parent section's tab, just like navigating within a site keeps you
// on the same browser tab.
const SECTIONS: { base: string; label: string }[] = [
  { base: "/personnel", label: "PERSONNEL" },
  { base: "/messages", label: "MESSAGES" },
  { base: "/scp", label: "SCP FILES" },
  { base: "/incidents", label: "INCIDENTS" },
  { base: "/broadcasts", label: "BROADCASTS" },
  { base: "/clearance-request", label: "CLEARANCE" },
  { base: "/secure-channel", label: "SECURE CHANNEL" },
  { base: "/admin", label: "ADMIN" },
  { base: "/profile", label: "PROFILE" },
  { base: "/settings", label: "SETTINGS" },
];

function sectionFor(path: string): { base: string; label: string } | null {
  let best: { base: string; label: string } | null = null;
  for (const s of SECTIONS) {
    if (path === s.base || path.startsWith(s.base + "/")) {
      if (!best || s.base.length > best.base.length) best = s;
    }
  }
  return best;
}

type Tab = { base: string; label: string; href: string };

const STORAGE_KEY = "scip-open-tabs";

// Cap on simultaneously open tabs. Without one the strip grows until every
// section is open, which on a phone means a long scroll to reach anything.
// Past the cap the least-recently-visited tab is evicted, the way a browser
// with too many tabs would drop the oldest.
const MAX_TABS = 6;

// ---------------------------------------------------------------------------
// Open-tab store
//
// The tab list lives in sessionStorage, which is an external store — so it is
// modeled as one and read through useSyncExternalStore rather than mirrored
// into component state. That removes the two problems the state-mirroring
// version had: restoring from storage needed a setState inside an effect
// (cascading render), and the server render had to be reconciled by hand with
// a `ready` flag. useSyncExternalStore handles the server/client split via
// getServerSnapshot, and folding a route into the list becomes an ordinary
// external-system write, which is what effects are actually for.
// ---------------------------------------------------------------------------

// Stable empty reference. getSnapshot must return an identical reference when
// nothing changed, or React re-renders forever.
const EMPTY: Tab[] = [];

let snapshot: Tab[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function readStorage(): Tab[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Tab[]) : EMPTY;
  } catch {
    // Malformed or unavailable storage: start from an empty strip.
    return EMPTY;
  }
}

// Read storage once, on first access from the browser.
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  snapshot = readStorage();
}

function commit(next: Tab[]) {
  snapshot = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
  for (const listener of listeners) listener();
}

const tabStore = {
  subscribe(listener: () => void) {
    hydrate();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): Tab[] {
    hydrate();
    return snapshot;
  },
  // No sessionStorage on the server: the strip renders empty and fills in
  // once the client takes over.
  getServerSnapshot(): Tab[] {
    return EMPTY;
  },
  // Fold a visited route into the list, or update the remembered href of a
  // tab that is already open.
  open(base: string, label: string, href: string) {
    const existing = snapshot.find((t) => t.base === base);
    if (existing) {
      // Bail when nothing changed — without this the effect that calls
      // `open` would loop.
      if (existing.href === href) return;
      commit(snapshot.map((t) => (t.base === base ? { ...t, href } : t)));
      return;
    }
    const next = [...snapshot, { base, label, href }];
    // Evict from the front (least recently opened) once past the cap. The tab
    // just appended always survives.
    commit(next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next);
  },
  // Close a tab, returning the href to navigate to if the closed tab was the
  // active one.
  close(base: string): string {
    const idx = snapshot.findIndex((t) => t.base === base);
    if (idx === -1) return "/menu";
    const next = snapshot.filter((t) => t.base !== base);
    commit(next);
    // Prefer the tab that slid into the closed slot, else the one before it.
    return (next[idx] ?? next[idx - 1])?.href ?? "/menu";
  },
};

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const stripRef = useRef<HTMLDivElement>(null);

  const tabs = useSyncExternalStore(
    tabStore.subscribe,
    tabStore.getSnapshot,
    tabStore.getServerSnapshot
  );

  // Fold the current route into the open-tabs list. This writes to the
  // sessionStorage-backed store — an external system — rather than to
  // component state, so it does not cascade renders.
  useEffect(() => {
    const sec = sectionFor(pathname);
    if (sec) tabStore.open(sec.base, sec.label, pathname);
  }, [pathname]);

  // Keep the active tab in view when the strip is scrolled horizontally.
  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>("[data-active='true']");
    active?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [pathname, tabs.length]);

  const activeBase = sectionFor(pathname)?.base ?? null;
  const onMenu = pathname === "/menu";

  function closeTab(base: string) {
    const fallback = tabStore.close(base);
    // Only navigate away if the tab being closed is the one on screen.
    if (base === activeBase) router.push(fallback);
  }

  // Arrow-key traversal between tabs, as the tablist role promises.
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const strip = stripRef.current;
    if (!strip) return;
    const items = Array.from(
      strip.querySelectorAll<HTMLElement>("[role='tab']")
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    // Wrap around at both ends.
    items[(current + delta + items.length) % items.length]?.focus();
  }

  return (
    <div
      ref={stripRef}
      className="tabbar"
      role="tablist"
      aria-label="Open sections"
      onKeyDown={onKeyDown}
    >
      <Link
        href="/menu"
        className={`tab tab--home${onMenu ? " tab--active" : ""}`}
        role="tab"
        aria-selected={onMenu}
        data-active={onMenu}
        // Roving tabindex: exactly one stop in the strip. Home takes it
        // whenever no section tab is active, so the strip is never
        // unreachable by keyboard.
        tabIndex={onMenu || !activeBase ? 0 : -1}
      >
        ⌂ MENU
      </Link>

      {tabs.map((tab) => {
        const active = tab.base === activeBase;
        return (
          <div
            key={tab.base}
            className={`tab-wrap${active ? " tab-wrap--active" : ""}`}
            data-active={active}
          >
            <Link
              href={tab.href}
              className="tab"
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
            >
              <span className="tab__label">{tab.label}</span>
            </Link>
            <button
              type="button"
              className="tab__close"
              aria-label={`Close ${tab.label}`}
              onClick={() => closeTab(tab.base)}
            >
              ×
            </button>
          </div>
        );
      })}

      {tabs.length >= MAX_TABS && (
        <span className="tab-overflow" title={`Showing the ${MAX_TABS} most recent sections`}>
          MAX {MAX_TABS}
        </span>
      )}

      <Link href="/menu" className="tab tab--new" aria-label="New tab">
        +
      </Link>
    </div>
  );
}
