"use client";

import { useEffect } from "react";
import "./globals.css";

// Last-resort fault handler: this replaces the ROOT LAYOUT, so it is what
// catches a throw in app/layout.tsx or in (app)/layout.tsx — which is where
// requireUser(), enforceMaintenance(), enforceShutdown() and enforceSentinel()
// run. A database outage takes out the layout before any page renders, and
// without this file that lands a member on the stock framework error screen.
//
// Because it replaces the root layout it must supply its own <html>, <body>
// and stylesheet. It does NOT get the pre-paint appearance script, so a saved
// theme will not be applied here — that is fine and deliberate: globals.css
// defines the full default palette on :root, so this renders in phosphor green
// for everyone rather than half-styled.
//
// No `metadata` export is possible in a Client Component; the React <title>
// element is the supported way to set it.
//
// Navigation out of here is a plain <a>, not next/link. The router is part of
// what may have failed, so the only reliable escape is a full document load.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[global-fault]", error);
  }, [error]);

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <title>SCiP.net // TERMINAL OFFLINE</title>

        <div className="hud-banner hud-banner--alert-red">
          ⚠ TERMINAL FAULT — SESSION SHELL UNAVAILABLE ⚠
        </div>

        <div className="flex-1 flex items-center justify-center p-4">
          <div className="term-panel w-full max-w-md space-y-4 text-center p-6">
            <div className="hud-recid">SCiP-220 // SYSTEM FAULT</div>
            <h1
              className="text-lg text-[var(--term-red)]"
              style={{ letterSpacing: "0.18em" }}
            >
              ⚠ TERMINAL OFFLINE ⚠
            </h1>
            <p className="text-sm">
              THE TERMINAL SHELL FAILED TO INITIALIZE. THIS IS A FAULT ON THE
              FACILITY SIDE, NOT WITH YOUR CREDENTIALS.
            </p>
            <p className="text-sm text-[var(--term-fg-dim)]">
              YOUR RECORDS ARE UNAFFECTED. RETRY THE CONNECTION; IF THE FAULT
              PERSISTS, THE FACILITY IS DOWN AND WILL RESTORE ON ITS OWN.
            </p>
            {error.digest && (
              <p className="text-sm text-[var(--term-fg-dim)]">
                REFERENCE:{" "}
                <span className="text-[var(--term-fg)]">{error.digest}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-3 justify-center pt-1">
              <button
                type="button"
                className="term-button"
                onClick={() => unstable_retry()}
              >
                [RETRY CONNECTION]
              </button>
              <a href="/login" className="term-button term-button--ghost">
                [ACCESS POINT]
              </a>
            </div>
          </div>
        </div>

        <div className="hud-banner hud-banner--ts">
          ALL ACCESS ATTEMPTS ARE LOGGED AND TRACED
        </div>
      </body>
    </html>
  );
}
