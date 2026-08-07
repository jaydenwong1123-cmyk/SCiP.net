"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  activeBase,
  badgeCount,
  type BadgeCounts,
  type Section,
} from "@/lib/sections";

// ---------------------------------------------------------------------------
// Command rail
//
// Replaces the browser-style tab strip. The tab metaphor carried two things
// that do not belong in an operations console: sections had to be *opened*
// before they existed in the navigation, and an LRU cap silently evicted the
// ones you had not touched lately. A console keeps every station on the board
// and lights the one you are at.
//
// The visible station list is computed on the server (permission gates live in
// lib/sections-access.ts) and passed in already filtered, so this component
// never decides who may see what.
// ---------------------------------------------------------------------------

// Stations kept on the phone bar itself; the rest live behind ⋯ ALL. Chosen as
// the ones a member touches most, not by registry order.
const MOBILE_PRIMARY = ["/personnel", "/messages", "/scp", "/incidents"];

export function CommandRail({
  sections,
  counts,
  facility = "SCiP-220",
  callsign,
  linkState = "SECURE",
}: {
  sections: Section[];
  counts: BadgeCounts;
  facility?: string;
  /** Rank label shown under the facility block, e.g. "L-5". */
  callsign?: string;
  linkState?: string;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const railRef = useRef<HTMLElement>(null);

  const active = activeBase(pathname, sections);
  const onMenu = pathname === "/menu";

  // Close the overflow drawer on navigation — otherwise it stays over the page
  // the member just asked for. Adjusted during render rather than in an effect:
  // the drawer's open state is derived from a prop change, so reacting to it
  // here avoids the extra committed render an effect would cause. Same pattern
  // the counter-intel case list uses to drop its selection after a delete.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    setDrawerOpen(false);
  }

  // Esc closes the drawer, matching every other overlay in the app.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Arrow-key traversal between stations, carried over from the tab strip.
  function onKeyDown(e: React.KeyboardEvent<HTMLElement>) {
    const vertical = e.key === "ArrowUp" || e.key === "ArrowDown";
    const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
    if (!vertical && !horizontal) return;
    const rail = railRef.current;
    if (!rail) return;
    const items = Array.from(
      rail.querySelectorAll<HTMLElement>("[data-station]")
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current === -1) return;
    e.preventDefault();
    const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
    items[(current + delta + items.length) % items.length]?.focus();
  }

  const primary = sections.filter((s) => MOBILE_PRIMARY.includes(s.base));

  return (
    <>
      <nav
        ref={railRef}
        className="hud-rail"
        aria-label="Facility stations"
        onKeyDown={onKeyDown}
      >
        {/* Facility identity. Doubles as the link home to the station board. */}
        <Link
          href="/menu"
          className="hud-rail__brand block no-underline"
          data-station
          aria-current={onMenu ? "page" : undefined}
        >
          <div
            className="text-[var(--term-fg-bright)]"
            style={{ letterSpacing: "0.16em", fontSize: "var(--hud-t-label)" }}
          >
            ▚ {facility}
          </div>
          <div className="hud-rail__brand-text mt-1 flex items-center gap-2">
            {callsign && <span className="clearance-chip text-[10px]">{callsign}</span>}
            <span className="hud-lamp hud-lamp--on">{linkState}</span>
          </div>
        </Link>

        {/* Desktop / tablet: every station, grouped. */}
        <div className="hidden sm:block">
          {GROUP_ORDER.map((group) => {
            const inGroup = sections.filter((s) => s.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group}>
                <div className="hud-rail__group">▸ {GROUP_LABELS[group]}</div>
                {inGroup.map((s) => (
                  <RailItem
                    key={s.base}
                    section={s}
                    counts={counts}
                    active={s.base === active}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {/* Phone: a bottom bar of primary stations plus an overflow control. */}
        <div className="flex sm:hidden w-full">
          {primary.map((s) => (
            <RailItem
              key={s.base}
              section={s}
              counts={counts}
              active={s.base === active}
              compact
            />
          ))}
          <button
            type="button"
            className="hud-rail__item"
            aria-expanded={drawerOpen}
            aria-label="All stations"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <span className="hud-rail__code">⋯ ALL</span>
          </button>
        </div>
      </nav>

      {drawerOpen && (
        <div className="hud-drawer sm:hidden" role="dialog" aria-label="All stations">
          <div className="hud-station-head mb-3">
            <div>
              <span className="hud-station-head__code">SCiP-220</span>
              <span className="hud-station-head__title">STATION INDEX</span>
            </div>
            <button
              type="button"
              className="term-button term-button--ghost"
              onClick={() => setDrawerOpen(false)}
            >
              [CLOSE]
            </button>
          </div>
          {GROUP_ORDER.map((group) => {
            const inGroup = sections.filter((s) => s.group === group);
            if (inGroup.length === 0) return null;
            return (
              <div key={group} className="mb-2">
                <div className="hud-rail__group">▸ {GROUP_LABELS[group]}</div>
                {inGroup.map((s) => (
                  <RailItem
                    key={s.base}
                    section={s}
                    counts={counts}
                    active={s.base === active}
                    forceLabel
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function RailItem({
  section,
  counts,
  active,
  compact = false,
  forceLabel = false,
}: {
  section: Section;
  counts: BadgeCounts;
  active: boolean;
  compact?: boolean;
  forceLabel?: boolean;
}) {
  const n = badgeCount(section, counts);
  const accent =
    section.accent === "amber"
      ? " hud-rail__item--amber"
      : section.accent === "red"
        ? " hud-rail__item--red"
        : "";

  return (
    <Link
      href={section.base}
      data-station
      className={`hud-rail__item${active ? " hud-rail__item--on" : ""}${accent}`}
      aria-current={active ? "page" : undefined}
      // The label is hidden at narrow widths, so the accessible name has to
      // come from here rather than from the visible text.
      aria-label={section.label}
      title={section.label}
    >
      <span className="hud-rail__code">{section.code}</span>
      <span
        className="hud-rail__label"
        style={forceLabel ? { display: "block" } : undefined}
      >
        {section.label}
      </span>
      {n > 0 && (
        <span
          className="hud-rail__badge"
          aria-label={`${n} ${section.badgeLabel ?? "new"}`}
        >
          {n > 99 ? "99+" : n}
        </span>
      )}
      {compact && n > 0 && <span className="sr-only">{section.badgeLabel}</span>}
    </Link>
  );
}
