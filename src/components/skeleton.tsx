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

// A panel header: title bar plus an optional action chip on the right.
export function SkeletonHeader({ action = false }: { action?: boolean }) {
  return (
    <div className="term-panel flex items-center justify-between gap-4">
      <SkeletonLine width="14rem" height="1.1rem" />
      {action && <SkeletonLine width="7rem" height="1.6rem" />}
    </div>
  );
}

// A list of rows inside a panel, matching the two-column list layout used by
// the archive, incident, and personnel registries.
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="term-panel space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-4 term-row"
          // Stagger the shimmer so rows don't pulse in lockstep.
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <SkeletonLine width={`${45 + ((i * 7) % 30)}%`} />
          <SkeletonLine width="8rem" />
        </div>
      ))}
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
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <SkeletonHeader action={action} />
      <SkeletonRows rows={rows} />
    </div>
  );
}

// A document body: header, metadata line, then paragraph lines.
export function SkeletonDocument({ label = "Loading" }: { label?: string }) {
  return (
    <div className="term-panel space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <SkeletonLine width="18rem" height="1.1rem" />
      <SkeletonLine width="60%" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <SkeletonLine key={i} width={`${70 + ((i * 11) % 30)}%`} />
        ))}
      </div>
    </div>
  );
}
