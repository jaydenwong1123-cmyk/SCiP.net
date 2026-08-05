import type { HackStreak } from "@/lib/hack/streak";

// Read-only summary of the member's own resolved run history. Renders
// nothing until there IS history — a member who has never breached the
// terminal has no streak to report.
export function StreakPanel({ streak }: { streak: HackStreak }) {
  if (streak.currentKind === null) return null;

  const currentIsSuccess = streak.currentKind === "success";
  const currentColor = currentIsSuccess
    ? "text-[var(--term-fg-bright)]"
    : "text-[var(--term-red)]";
  const currentLabel = currentIsSuccess
    ? `${streak.current} SUCCESSFUL EXTRACTION${streak.current === 1 ? "" : "S"}`
    : `${streak.current} REPELLED INTRUSION${streak.current === 1 ? "" : "S"}`;

  return (
    <div className="term-panel space-y-1 text-sm">
      <h2 className="text-sm tracking-widest text-[var(--term-fg-bright)]">
        RUN HISTORY
      </h2>
      <p>
        CURRENT STREAK — <span className={currentColor}>{currentLabel}</span>
      </p>
      <p className="text-xs text-[var(--term-fg-dim)]">
        BEST {streak.bestSuccess} STRAIGHT EXTRACTION
        {streak.bestSuccess === 1 ? "" : "S"} · WORST {streak.bestFailure}{" "}
        STRAIGHT REPELLED
      </p>
    </div>
  );
}
