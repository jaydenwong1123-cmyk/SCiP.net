"use client";

import { useEffect, useRef, useState } from "react";

// Countdown.
//
// Rendered from the server's own clock: `serverNowMs` was captured alongside
// `deadlineMs`, so the difference between it and the local clock is a known
// offset that can be subtracted. A player who winds their OS clock forward
// therefore sees an unchanged timer, and one who winds it back gains nothing —
// the server re-checks the deadline on submit regardless.
//
// Shared by the intrusion console and the counter-intrusion duel. In a duel it
// is the same deadline drawn twice, once per seat, from two different starting
// stamps — see deliverDuel() in lib/hack/duel.ts for why those differ.
export function Countdown({
  deadlineMs,
  serverNowMs,
  onExpire,
  label = "SEC TO TRACE",
}: {
  deadlineMs: number;
  serverNowMs: number;
  onExpire: () => void;
  label?: string;
}) {
  // Seeded from the server's own budget rather than from the local clock, so
  // the first paint is correct without reading Date.now() during render.
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, deadlineMs - serverNowMs)
  );
  const fired = useRef(false);
  // Kept in a ref rather than a dependency: `onExpire` is an inline callback
  // that gets a new identity on every keystroke elsewhere in the tree, and
  // this effect must not tear down and restart (which would reset the timer)
  // just because unrelated state changed.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    // Offset between this browser's clock and the server's, measured once on
    // mount. Subtracting it means a player who winds their OS clock forward
    // sees an unchanged timer — and the server re-checks the deadline on
    // submit regardless, so the display is never load-bearing.
    const skew = Date.now() - serverNowMs;
    const tick = () => {
      const left = Math.max(0, deadlineMs - (Date.now() - skew));
      setRemaining(left);
      if (left <= 0 && !fired.current) {
        fired.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadlineMs, serverNowMs]);

  const seconds = remaining / 1000;
  const critical = seconds <= 5;

  return (
    <div
      className={`hack-timer${critical ? " hack-timer--critical" : ""}`}
      role="timer"
      aria-live="off"
    >
      <span className="tabular-nums">{seconds.toFixed(1)}</span>
      <span className="text-[var(--term-fg-dim)]"> {label}</span>
    </div>
  );
}
