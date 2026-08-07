// Shared loading primitives for route-level loading.tsx files.
//
// These mirror the shape of the real content (a panel header, then rows) so
// the swap-in doesn't shift layout — the skeleton reserves the space the
// content will occupy.

export function SkeletonLine({
  width = "100%",
  height = "0.75rem",
}: {
  width?: string;
  height?: string;
}) {
  return <div className="skel" style={{ width, height }} />;
}

// A station header: designator + title, over the hairline rule the real
// StationHead draws, plus optional readouts on the right.
export function SkeletonHeader({ action = false }: { action?: boolean }) {
  return (
    <div className="hud-station-head">
      <div className="space-y-1">
        <SkeletonLine width="8rem" height="0.5rem" />
        <SkeletonLine width="14rem" height="1.1rem" />
      </div>
      {action && (
        <div className="flex gap-4">
          <SkeletonLine width="4rem" height="1.6rem" />
          <SkeletonLine width="7rem" height="1.6rem" />
        </div>
      )}
    </div>
  );
}

// A list of rows inside a station panel, matching the two-column list layout
// used by the archive, incident, and personnel registries.
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="term-panel">
      <div className="hud-panel-head">
        <SkeletonLine width="3rem" height="0.6rem" />
        <SkeletonLine width="8rem" height="0.6rem" />
      </div>
      <div className="hud-list">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 term-row py-2"
            // Stagger the shimmer so rows don't pulse in lockstep.
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <SkeletonLine width={`${45 + ((i * 7) % 30)}%`} />
            <SkeletonLine width="8rem" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Full-page fallback: header + rows. `label` is announced to screen readers
// so the wait isn't silent.
export function SkeletonPage({
  rows = 6,
  action = false,
  label = "Loading",
}: {
  rows?: number;
  action?: boolean;
  label?: string;
}) {
  return (
    <div
      className="flex flex-col gap-[var(--term-gap)]"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <SkeletonHeader action={action} />
      <SkeletonRows rows={rows} />
    </div>
  );
}

// A document body: station header, a field grid, then the record's paragraphs.
export function SkeletonDocument({ label = "Loading" }: { label?: string }) {
  return (
    <div
      className="flex flex-col gap-[var(--term-gap)]"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">{label}</span>
      <SkeletonHeader action />
      <div className="hud-fields">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <SkeletonLine width="4rem" height="0.5rem" />
            <SkeletonLine width="6rem" height="0.9rem" />
          </div>
        ))}
      </div>
      <div className="term-panel">
        <div className="hud-panel-head">
          <SkeletonLine width="2rem" height="0.6rem" />
          <SkeletonLine width="6rem" height="0.6rem" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonLine key={i} width={`${70 + ((i * 11) % 30)}%`} />
          ))}
        </div>
      </div>
    </div>
  );
}
