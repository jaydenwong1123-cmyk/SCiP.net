"use client";

import { useEffect, useRef, useState } from "react";

const BOOT_LINES = [
  "SCiP.NET BIOS v4.7.2 — SECURE CONTAINMENT INTRANET",
  "POST........................ OK",
  "MEMORY CHECK................ 640K OK",
  "CRYPTO MODULE............... ONLINE",
  "ESTABLISHING UPLINK TO SITE-19...",
  "  > HANDSHAKE............... OK",
  "  > CHANNEL ENCRYPTED....... AES-256",
  "CLEARANCE VERIFICATION SUBSYSTEM READY",
  "WARNING: UNAUTHORIZED ACCESS IS A CLASS-3 INFRACTION",
  "LOADING LOGIN INTERFACE...",
];

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState<string[]>([]);
  const doneRef = useRef(onDone);

  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    let i = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      setShown((prev) => [...prev, BOOT_LINES[i]]);
      i += 1;
      if (i < BOOT_LINES.length) {
        timers.push(setTimeout(tick, 180 + Math.random() * 160));
      } else {
        timers.push(setTimeout(() => doneRef.current(), 550));
      }
    };
    timers.push(setTimeout(tick, 120));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <button
      type="button"
      onClick={() => doneRef.current()}
      className="min-h-screen w-full flex items-start justify-center p-4 cursor-default text-left"
      aria-label="Skip boot sequence"
    >
      <pre className="font-mono text-sm text-[var(--term-fg)] leading-relaxed mt-[10vh]">
        {shown.map((line, idx) => (
          <div key={idx}>{line}</div>
        ))}
        <span className="term-cursor" />
      </pre>
    </button>
  );
}
