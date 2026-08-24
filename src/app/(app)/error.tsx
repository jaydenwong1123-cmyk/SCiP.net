"use client";

import Link from "next/link";
import { useEffect } from "react";
import { HudPanel, StationHead, Readout, TickRule } from "@/components/hud";

// Segment-level fault handler for every authenticated station.
//
// This sits INSIDE the app layout, so the command rail, banners and chrome all
// survive a thrown page — a member who trips a fault stays inside the terminal
// instead of being dropped onto a stock framework error screen, which is the
// one thing guaranteed to break the fiction completely.
//
// It does NOT catch faults in (app)/layout.tsx itself: an error boundary never
// wraps the layout in its own segment. The layout is where requireUser() and
// the maintenance/shutdown gates run, so a fault there is caught by
// app/global-error.tsx instead.
//
// WHAT IS SAFE TO SHOW: `digest` only. In production Next replaces a Server
// Component's error message with a generic string precisely so internals do
// not leak to the browser, and this app has more than the usual amount worth
// not leaking — solutions, nonces, run ids. The digest is a hash that means
// nothing on its own but matches the server log, so it is the right thing to
// put in front of a member filing a bug report.
export default function StationFault({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[station-fault]", error);
  }, [error]);

  return (
    <>
      <StationHead code="SYS-FAULT" title="TERMINAL FAULT">
        <Readout label="STATUS" value="SEGMENT HALTED" tone="red" />
        {error.digest && (
          <Readout label="REFERENCE" value={error.digest} tone="dim" small />
        )}
      </StationHead>

      <HudPanel code="01" title="DIAGNOSTIC" status="UNRECOVERED" variant="alert">
        <div className="p-4 space-y-4">
          <p className="text-sm">
            THIS STATION FAILED TO RENDER. THE FAULT HAS BEEN LOGGED. YOUR
            SESSION AND YOUR RECORDS ARE UNAFFECTED.
          </p>

          <TickRule />

          <p className="text-sm" style={{ color: "var(--term-fg-dim)" }}>
            RETRY RE-REQUESTS THIS STATION FROM THE SERVER. IF IT FAILS AGAIN,
            RETURN TO THE STATION BOARD AND FILE A BUG REPORT
            {error.digest ? (
              <>
                {" "}
                QUOTING REFERENCE{" "}
                <span style={{ color: "var(--term-fg)" }}>{error.digest}</span>
              </>
            ) : null}
            .
          </p>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="button"
              className="term-button"
              onClick={() => unstable_retry()}
            >
              [RETRY]
            </button>
            <Link href="/menu" className="term-button term-button--ghost">
              [STATION BOARD]
            </Link>
            <Link
              href="/tickets/new"
              className="term-button term-button--ghost"
            >
              [FILE BUG REPORT]
            </Link>
          </div>
        </div>
      </HudPanel>
    </>
  );
}
