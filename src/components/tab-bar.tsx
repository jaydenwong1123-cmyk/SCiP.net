"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [ready, setReady] = useState(false);

  // Restore previously open tabs after mount (avoids hydration mismatch).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) setTabs(JSON.parse(raw) as Tab[]);
    } catch {
      /* ignore malformed storage */
    }
    setReady(true);
  }, []);

  // Fold the current route into the open-tabs list.
  useEffect(() => {
    if (!ready) return;
    const sec = sectionFor(pathname);
    if (!sec) return;
    setTabs((prev) => {
      if (prev.some((t) => t.base === sec.base)) {
        return prev.map((t) =>
          t.base === sec.base ? { ...t, href: pathname } : t
        );
      }
      return [...prev, { base: sec.base, label: sec.label, href: pathname }];
    });
  }, [pathname, ready]);

  // Persist across navigations for the session.
  useEffect(() => {
    if (!ready) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
    } catch {
      /* ignore quota / disabled storage */
    }
  }, [tabs, ready]);

  const activeBase = sectionFor(pathname)?.base ?? null;
  const onMenu = pathname === "/menu";

  function closeTab(base: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.base === base);
      const next = prev.filter((t) => t.base !== base);
      if (base === activeBase) {
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        router.push(fallback ? fallback.href : "/menu");
      }
      return next;
    });
  }

  return (
    <div className="tabbar" role="tablist" aria-label="Open sections">
      <Link
        href="/menu"
        className={`tab tab--home${onMenu ? " tab--active" : ""}`}
        role="tab"
        aria-selected={onMenu}
      >
        ⌂ MENU
      </Link>

      {tabs.map((tab) => {
        const active = tab.base === activeBase;
        return (
          <Link
            key={tab.base}
            href={tab.href}
            className={`tab${active ? " tab--active" : ""}`}
            role="tab"
            aria-selected={active}
          >
            <span className="tab__label">{tab.label}</span>
            <button
              type="button"
              className="tab__close"
              aria-label={`Close ${tab.label}`}
              onClick={(e) => closeTab(tab.base, e)}
            >
              ×
            </button>
          </Link>
        );
      })}

      <Link href="/menu" className="tab tab--new" aria-label="New tab">
        +
      </Link>
    </div>
  );
}
