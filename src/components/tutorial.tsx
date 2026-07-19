"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "scip-tutorial-seen";

export function Tutorial() {
  const [open, setOpen] = useState(false);

  // Auto-open once per browser on first login.
  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY) !== "1") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
      localStorage.setItem(SEEN_KEY, "1");
    }
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="term-link cursor-pointer bg-transparent border-none p-0 text-[var(--term-fg)]"
      >
        [? HELP]
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="term-panel w-full max-w-2xl my-8 space-y-4 text-sm"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg tracking-widest">
                :: FIELD OPERATIVE BRIEFING ::
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="term-button text-xs"
              >
                [CLOSE]
              </button>
            </div>

            <p className="text-[var(--term-fg-dim)]">
              Welcome to SCiP.NET. This terminal is your interface to Foundation
              records and communications. Quick orientation:
            </p>

            <section className="space-y-1">
              <h3 className="text-[var(--term-fg-bright)]">◈ REDACTION SYNTAX</h3>
              <p>
                When writing SCP files or incident reports, you can hide text by
                clearance level:
              </p>
              <ul className="list-none space-y-1 pl-2 text-[var(--term-fg-dim)]">
                <li>
                  <code className="text-[var(--term-fg)]">[*secret*]</code> —
                  hidden from everyone (full black box).
                </li>
                <li>
                  <code className="text-[var(--term-fg)]">[*secret*][4]</code> —
                  visible only to L-4 clearance and above; lower levels see a
                  redaction box.
                </li>
                <li>
                  <code className="text-[var(--term-fg)]">[*secret*][O5]</code> or{" "}
                  <code className="text-[var(--term-fg)]">[OMNI]</code> — restrict
                  to L-O5 / L-OMNI.
                </li>
              </ul>
            </section>

            <section className="space-y-1">
              <h3 className="text-[var(--term-fg-bright)]">◈ SECTIONS</h3>
              <ul className="list-none space-y-1 pl-2 text-[var(--term-fg-dim)]">
                <li>
                  <span className="text-[var(--term-fg)]">PERSONNEL</span> — the
                  member roster and personnel files.
                </li>
                <li>
                  <span className="text-[var(--term-fg)]">MESSAGES</span> —
                  private, threaded conversations. Open one and hit REPLY to
                  continue the thread.
                </li>
                <li>
                  <span className="text-[var(--term-fg)]">SCP FILES</span> — the
                  archive, filtered by object class and your clearance. File new
                  entries if authorized.
                </li>
                <li>
                  <span className="text-[var(--term-fg)]">INCIDENTS</span> — file
                  and read incident reports by severity.
                </li>
                <li>
                  <span className="text-[var(--term-fg)]">BROADCASTS</span> —
                  site-wide announcements.
                </li>
                <li>
                  <span className="text-[var(--term-fg)]">CLEARANCE</span> —
                  request a clearance change; staff review it with a note.
                </li>
              </ul>
            </section>

            <p className="text-xs text-[var(--term-fg-dim)]">
              You can reopen this briefing anytime via the{" "}
              <span className="text-[var(--term-fg)]">[? HELP]</span> link in the
              navigation bar.
            </p>

            <div className="text-right">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="term-button text-sm"
              >
                ACKNOWLEDGED
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
