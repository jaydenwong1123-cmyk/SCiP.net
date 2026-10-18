"use client";

import type { PublicSystem } from "@/lib/ci/siege-store";

// Integrity bars for every system in a siege. Purely presentational; the
// console decides what the per-row action button does.
export function SiegeBoard({
  systems,
  mainframeOpen,
  action,
}: {
  systems: PublicSystem[];
  mainframeOpen: boolean;
  action?: (system: PublicSystem) => React.ReactNode;
}) {
  return (
    <ul className="space-y-2">
      {systems.map((s) => {
        const pct = s.max > 0 ? Math.round((s.integrity / s.max) * 100) : 0;
        const sealed = s.id === "mainframe" && !mainframeOpen && !s.fallen;
        const tone = s.fallen ? "ci-bar--down" : pct < 40 ? "ci-bar--low" : "";
        return (
          <li key={s.id} className="ci-system">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>
                <span className="hud-recid">{s.code}</span> {s.label}
              </span>
              <span
                className={
                  s.fallen
                    ? "text-[var(--term-red)]"
                    : sealed
                      ? "text-[var(--term-fg-dim)]"
                      : "text-[var(--term-fg-bright)]"
                }
              >
                {s.fallen ? "OFFLINE" : sealed ? "SEALED" : `${s.integrity}/${s.max}`}
              </span>
            </div>
            <div
              className={`ci-bar ${tone}`.trim()}
              role="meter"
              aria-label={`${s.label} integrity`}
              aria-valuemin={0}
              aria-valuemax={s.max}
              aria-valuenow={s.integrity}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            {action && <div className="pt-1">{action(s)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
