export default function Loading() {
  return (
    <div className="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-4 animate-pulse">
      <div className="text-center">
        <div className="text-lg sm:text-2xl tracking-widest text-[var(--term-fg-bright)]">
          MAIN MENU
        </div>
        <div className="text-xs sm:text-sm text-[var(--term-fg-dim)] mt-1">
          {"// LOADING MODULES..."}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="menu-tile term-panel">
            <div className="h-4 w-2/3 bg-[var(--term-border)]/40 rounded" />
            <div className="mt-3 h-3 w-full bg-[var(--term-border)]/25 rounded" />
            <div className="mt-2 h-3 w-1/2 bg-[var(--term-border)]/25 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
