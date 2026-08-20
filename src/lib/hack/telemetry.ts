"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Per-round conduct telemetry, collected in the browser.
//
// READ THIS BEFORE TRUSTING ANYTHING IT PRODUCES. Every number here is
// client-reported, which means a determined cheat can write whatever they like
// into it. That is not a flaw in the design, it is the design: the value of
// this data is not that it is reliable, it is that FORGING it costs a script.
// Someone pasting a ciphertext into a chat window is not going to intercept a
// server action to fake a keystroke count, and the moment they would have to,
// the cheat has stopped being cheap — which was the whole objective.
//
// It is therefore weighted low in lib/hack/suspicion.ts, and it is never on
// its own the reason a round is marked. The unforgeable half of the score —
// elapsed time measured against the server's own issue stamp — carries the
// weight. This half corroborates.
//
// Shared between the /hack and /counter-intel route groups, which is why it
// lives in lib rather than beside either console.

// What the puzzle renderers report into. Handed down through GameProps so a
// renderer never has to know which console is hosting it.
export type RoundSignals = {
  // A keystroke landed in the answer box.
  key: () => void;
  // A click/pick on the puzzle body itself.
  pointer: () => void;
  // A paste was attempted and refused.
  blockedPaste: () => void;
  // A copy/cut/drag was attempted and refused.
  blockedCopy: () => void;
};

export type RoundTelemetry = {
  signals: RoundSignals;
  // Total ms this round spent with the tab hidden or the window unfocused.
  // Exposed so the console can show a warning; it is NEVER used to fail a
  // round or to touch the clock — a member on a second monitor, taking a
  // screenshot, or reading an OS notification is not a cheat.
  offTerminalMs: number;
  // Compact ASCII JSON for the FormData. Safe past findNonAsciiFormField.
  snapshot: () => string;
  // Handlers for the wrapper around a puzzle form: refuse copy/cut/drag and
  // record the attempt.
  guardProps: {
    onCopy: (e: React.ClipboardEvent) => void;
    onCut: (e: React.ClipboardEvent) => void;
    onDragStart: (e: React.DragEvent) => void;
  };
};

// Longest snapshot we will ever send. The shape is fixed and small; the cap is
// a backstop against a tampered client posting a megabyte into the column.
const MAX_SNAPSHOT = 300;

type Counters = {
  k: number;
  p: number;
  paste: number;
  copy: number;
  blurs: number;
  blurMs: number;
  // ms from round start to first input. -1 until something happens.
  t0: number;
  startedAt: number;
  blurredAt: number | null;
};

function freshCounters(startedAt: number): Counters {
  return {
    k: 0,
    p: 0,
    paste: 0,
    copy: 0,
    blurs: 0,
    blurMs: 0,
    t0: -1,
    startedAt,
    blurredAt: null,
  };
}

// Counters live in a ref rather than in state: they change on every keystroke
// and nothing on screen depends on them, so re-rendering the puzzle for each
// one would be pure waste. The one value the console DOES render — off-
// terminal time — is separate state, updated only when focus returns.
//
// The per-round reset happens in the effect below rather than as an adjust-
// during-render (the pattern useRoundInput uses) because a ref may not be
// written during render. The practical difference is one frame, on a value
// that only ever corroborates a server-side measurement.
export function useRoundTelemetry(nonce: string): RoundTelemetry {
  const counters = useRef<Counters>(freshCounters(0));
  const [seenNonce, setSeenNonce] = useState(nonce);
  const [offTerminalMs, setOffTerminalMs] = useState(0);

  // The rendered half of the reset — cleared during render, the same
  // adjust-state-during-render pattern useRoundInput documents, so the
  // previous round's off-terminal time never flashes on the new round. The
  // counters themselves are reset in the effect below; a ref cannot be
  // written here, and setState cannot be called there.
  if (nonce !== seenNonce) {
    setSeenNonce(nonce);
    setOffTerminalMs(0);
  }

  // Off-terminal accounting. Both listeners feed the same accumulator: a tab
  // switch fires visibilitychange, an alt-tab to another window fires blur,
  // and a click onto a second monitor fires only blur. Guarded so overlapping
  // events cannot double-count the same absence.
  //
  // Keyed on the nonce, so a new round gets fresh counters and a fresh start
  // stamp at the same moment it gets fresh listeners.
  useEffect(() => {
    counters.current = freshCounters(Date.now());

    const leave = () => {
      const c = counters.current;
      if (c.blurredAt !== null) return;
      c.blurredAt = Date.now();
      c.blurs += 1;
    };
    const back = () => {
      const c = counters.current;
      if (c.blurredAt === null) return;
      c.blurMs += Date.now() - c.blurredAt;
      c.blurredAt = null;
      setOffTerminalMs(c.blurMs);
    };
    const visibility = () => (document.hidden ? leave() : back());

    window.addEventListener("blur", leave);
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("blur", leave);
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [nonce]);

  const mark = useCallback(() => {
    const c = counters.current;
    if (c.t0 < 0) c.t0 = Date.now() - c.startedAt;
  }, []);

  const key = useCallback(() => {
    mark();
    counters.current.k += 1;
  }, [mark]);

  const pointer = useCallback(() => {
    mark();
    counters.current.p += 1;
  }, [mark]);

  const blockedPaste = useCallback(() => {
    counters.current.paste += 1;
  }, []);

  const blockedCopy = useCallback(() => {
    counters.current.copy += 1;
  }, []);

  const snapshot = useCallback(() => {
    const c = counters.current;
    // Fold in an absence still in progress, so submitting without ever coming
    // back to the tab is not recorded as zero time away.
    const pendingBlur = c.blurredAt === null ? 0 : Date.now() - c.blurredAt;
    const json = JSON.stringify({
      k: c.k,
      p: c.p,
      paste: c.paste,
      copy: c.copy,
      blurs: c.blurs,
      blurMs: c.blurMs + pendingBlur,
      t0: c.t0,
      ms: Date.now() - c.startedAt,
    });
    return json.length > MAX_SNAPSHOT ? "" : json;
  }, []);

  const guardProps = {
    onCopy: (e: React.ClipboardEvent) => {
      e.preventDefault();
      blockedCopy();
    },
    onCut: (e: React.ClipboardEvent) => {
      e.preventDefault();
      blockedCopy();
    },
    onDragStart: (e: React.DragEvent) => {
      e.preventDefault();
      blockedCopy();
    },
  };

  return {
    signals: { key, pointer, blockedPaste, blockedCopy },
    offTerminalMs,
    snapshot,
    guardProps,
  };
}

// "14S" / "2M 05S", for the LINK UNSTABLE notice.
export function formatOffTerminal(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}S`;
  return `${Math.floor(seconds / 60)}M ${String(seconds % 60).padStart(2, "0")}S`;
}
