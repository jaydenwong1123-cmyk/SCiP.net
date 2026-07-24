"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Public lockdown countdown. Ticks down to `targetMs` (epoch ms) once a second,
// and when the clock runs out asks the server to re-render — at which point the
// gate sees the schedule has lapsed and lets everyone back in.
export function Countdown({ targetMs }: { targetMs: number }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(() => targetMs - Date.now());

  useEffect(() => {
    const tick = () => {
      const left = targetMs - Date.now();
      setRemaining(left);
      if (left <= 0) router.refresh();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetMs, router]);

  const clamped = Math.max(0, remaining);
  const totalSeconds = Math.floor(clamped / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="border border-[var(--term-border)]/40 p-3 text-center space-y-1">
      <div className="text-[10px] tracking-widest text-[var(--term-fg-dim)]">
        SYSTEM RESTORES IN
      </div>
      <div className="text-2xl tabular-nums text-[var(--term-amber)] tracking-widest">
        {days > 0 && `${days}d `}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </div>
      {clamped === 0 && (
        <div className="text-[10px] text-[var(--term-fg-dim)]">
          RECONNECTING...
        </div>
      )}
    </div>
  );
}
