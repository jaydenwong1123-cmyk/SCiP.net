"use client";

import { usePathname } from "next/navigation";
import { sectionFor } from "@/lib/sections";

// The current station, shown in the status bar. Client-side because a server
// layout has no access to the pathname — and because it must update on every
// navigation without the layout re-rendering.
export function StationBreadcrumb() {
  const pathname = usePathname();

  if (pathname === "/menu") {
    return (
      <>
        <span className="hud-statusbar__sep" aria-hidden>
          │
        </span>
        <span className="text-[var(--term-fg-bright)]">STATION BOARD</span>
      </>
    );
  }

  const section = sectionFor(pathname);
  if (!section) return null;

  return (
    <>
      <span className="hud-statusbar__sep" aria-hidden>
        │
      </span>
      <span className="hidden sm:inline text-[var(--term-fg-dim)]">
        {section.code}
      </span>
      <span className="text-[var(--term-fg-bright)]">{section.label}</span>
    </>
  );
}
