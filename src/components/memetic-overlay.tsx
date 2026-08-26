"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// MEMETIC AGENT — the receiving end.
//
// Mounted once by the (app) layout for every signed-in member, and inert for
// all of them until /api/memetic says otherwise. Three rules shape it:
//
//   1. IT ALWAYS ENDS. The server sends an absolute instant; a timer armed
//      against the local clock tears the overlay down when that instant
//      passes, whether or not another byte ever arrives from the network. An
//      exposure that outlived its window because a poll failed would be a
//      full-screen image nobody can remove.
//   2. IT NEVER RENDERS BLANK. The plate is preloaded before the overlay is
//      allowed to mount, so the first flash is the image and not a black sheet
//      of unexplained nothing.
//   3. IT IS NOT DRIVEN BY CSS ANIMATION. globals.css flattens every animation
//      under prefers-reduced-motion, which would silently freeze the flash on
//      exactly the machines most likely to have that set. The cadence is a
//      JS interval instead, so what the console says will happen is what
//      happens.

export type MemeticExposure = {
  agent: string;
  label: string;
  src: string;
  /** Milliseconds lit, then the same again dark. */
  periodMs: number;
  /** Epoch ms. */
  endsAt: number;
};

// Idle polling. Fast enough that a fired exposure lands while the overseer is
// still looking at the screen, slow enough to be nothing on a small roster.
const IDLE_POLL_MS = 3_000;
// While an exposure is up, the only thing worth catching quickly is a recall.
const ACTIVE_POLL_MS = 1_500;
// If the plate will not load, give up rather than hold a black screen waiting.
const PRELOAD_TIMEOUT_MS = 4_000;

function samePayload(a: MemeticExposure | null, b: MemeticExposure | null) {
  if (!a || !b) return a === b;
  return a.src === b.src && a.endsAt === b.endsAt && a.periodMs === b.periodMs;
}

export function MemeticOverlay({
  initial = null,
}: {
  /** Server-resolved exposure, so a page load lands mid-exposure already lit. */
  initial?: MemeticExposure | null;
}) {
  // Seeded straight from the server render rather than through an effect, so a
  // navigation that lands mid-exposure paints lit on the very first frame.
  // Re-checked against the clock because a prerendered-then-hydrated payload
  // can already have lapsed.
  const [exposure, setExposure] = useState<MemeticExposure | null>(() =>
    initial && initial.endsAt > Date.now() ? initial : null
  );
  const [lit, setLit] = useState(true);

  // Mirrored into a ref so the poll loop can read the current exposure without
  // re-subscribing — and tearing down its timer — on every beat of the cadence.
  const currentRef = useRef<MemeticExposure | null>(exposure);
  useEffect(() => {
    currentRef.current = exposure;
  }, [exposure]);

  // Accept a payload only once its plate is decoded and only if it has time
  // left on it. Both checks live here so neither the poll nor the initial prop
  // can bypass them.
  const accept = useCallback((next: MemeticExposure | null) => {
    if (!next) {
      setExposure(null);
      return;
    }
    if (next.endsAt <= Date.now()) return;
    if (samePayload(currentRef.current, next)) return;

    // Whichever of the three finishes first wins; the rest are no-ops.
    let settled = false;
    const arm = () => {
      if (settled) return;
      settled = true;
      // Re-checked after the load: a short exposure can lapse while its plate
      // is still coming down the wire.
      if (next.endsAt > Date.now()) {
        setLit(true);
        setExposure(next);
      }
    };

    setTimeout(arm, PRELOAD_TIMEOUT_MS);
    const img = new Image();
    img.onload = arm;
    img.onerror = arm;
    img.src = next.src;
    if (img.complete) arm();
  }, []);

  // The poll. One loop, its delay chosen by whether something is up.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (cancelled) return;
      // A hidden tab has no screen to flash. Skip the request but keep the
      // loop alive so the next visible tick picks things up.
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/memetic", { cache: "no-store" });
          if (!cancelled) {
            if (res.status === 200) {
              accept((await res.json()) as MemeticExposure);
            } else {
              // 204, or any failure the server chose to answer flatly with:
              // both mean "nothing for you", which includes a recall.
              setExposure(null);
            }
          }
        } catch {
          // A network blip must not tear down a live exposure — the endsAt
          // timer is what ends it, not the absence of a reply.
        }
      }
      if (!cancelled) {
        timer = setTimeout(tick, currentRef.current ? ACTIVE_POLL_MS : IDLE_POLL_MS);
      }
    }

    timer = setTimeout(tick, IDLE_POLL_MS);
    function onVisible() {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accept]);

  // Rule 1: the hard stop, on the local clock. Always a timer, never a
  // straight-line teardown — a zero-delay timeout still ends the exposure on
  // the next tick without a synchronous set during the effect.
  useEffect(() => {
    if (!exposure) return;
    const id = setTimeout(
      () => setExposure(null),
      Math.max(0, exposure.endsAt - Date.now())
    );
    return () => clearTimeout(id);
  }, [exposure]);

  // The cadence. Starts lit because accept() and the initial seed both leave it
  // that way, so this only has to keep the beat.
  useEffect(() => {
    if (!exposure) return;
    const id = setInterval(() => setLit((on) => !on), exposure.periodMs);
    return () => clearInterval(id);
  }, [exposure]);

  // Hold the page still underneath. Restored to whatever was there before
  // rather than to "", so an exposure fired while some other component owns
  // overflow does not leave the page unscrollable afterwards.
  useEffect(() => {
    if (!exposure) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [exposure]);

  if (!exposure) return null;

  return (
    <div className="memetic-overlay" role="presentation">
      <div
        className="memetic-overlay__plate"
        aria-hidden
        style={{
          backgroundImage: `url(${exposure.src})`,
          opacity: lit ? 1 : 0,
          // A half-frame nudge on each beat so successive flashes never land
          // in exactly the same place.
          transform: lit ? "scale(1.06)" : "scale(1.0)",
        }}
      />
      <div className="memetic-overlay__stamp" style={{ opacity: lit ? 0.85 : 0.25 }}>
        <span className="memetic-overlay__code">{exposure.label}</span>
        <span>COGNITOHAZARD — EXPOSURE IN PROGRESS</span>
        <span className="memetic-overlay__sub">
          DO NOT AVERT. ANTIMEMETIC COUNTERMEASURES ARE NOT AVAILABLE ON THIS
          TERMINAL.
        </span>
      </div>
    </div>
  );
}
