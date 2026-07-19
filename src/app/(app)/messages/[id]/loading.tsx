export default function Loading() {
  return (
    <div className="term-panel space-y-4 animate-pulse">
      <div className="flex items-center justify-between gap-2">
        <span className="h-5 w-1/2 bg-[var(--term-border)]/40 rounded" />
        <span className="h-4 w-24 bg-[var(--term-border)]/30 rounded" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border border-[var(--term-border)]/40 p-3 space-y-2"
          >
            <div className="h-3 w-2/3 bg-[var(--term-border)]/30 rounded" />
            <div className="h-3 w-full bg-[var(--term-border)]/20 rounded" />
            <div className="h-3 w-5/6 bg-[var(--term-border)]/20 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
