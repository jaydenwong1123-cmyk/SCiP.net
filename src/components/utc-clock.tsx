"use client";

import { useEffect, useState } from "react";

// Zulu-time readout for the status bar.
//
// Renders empty on the server and fills in after mount rather than seeding
// from Date.now() during render: the server's clock and the viewer's differ,
// and a mismatched first paint is exactly the hydration error this avoids.
export function UtcClock() {
  const [now, setNow] = useState<string | null>(null);

  useEffect(() => {
    function tick() {
      setNow(new Date().toISOString().slice(11, 19));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="hud-clock" aria-label="Current time, UTC">
      {now ? `${now}Z` : "--:--:--Z"}
    </span>
  );
}
