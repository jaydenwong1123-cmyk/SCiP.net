export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="term-panel flex items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: MESSAGE TERMINAL ::</h1>
        <span className="term-button text-sm opacity-60">[+ COMPOSE]</span>
      </div>
      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">CONVERSATIONS</h2>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex justify-between gap-x-4 py-1 border-b border-[var(--term-border)]/30"
          >
            <span className="h-3 w-1/2 bg-[var(--term-border)]/40 rounded" />
            <span className="h-3 w-24 bg-[var(--term-border)]/30 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
