"use client";

import { useMemo } from "react";

// Scrape-resistant rendering for the text that IS the puzzle.
//
// The problem this solves is narrow and worth stating precisely. A player who
// can lift the ciphertext out of the page as clean text can paste it into a
// language model and get the answer back. Selection blocking (see
// .hack-noselect in globals.css) stops the drag-and-Ctrl+C route; this stops
// the next one along, which is reading the panel out of the DOM — devtools,
// a bookmarklet, or a browser extension calling innerText on it.
//
// Two mechanisms, both purely presentational:
//
//   1. The character spans are emitted in SCRAMBLED DOM order and put back in
//      reading order with CSS `order`. textContent therefore returns the right
//      letters in the wrong sequence.
//   2. Decoy spans of junk are interleaved. They are .hack-decoy — absolutely
//      positioned and transparent rather than display:none, which matters: a
//      display:none element is excluded from innerText, whereas this one is
//      included. So both the cheap scrape (textContent) and the careful one
//      (innerText) come back corrupted, while the render is pixel-identical.
//
// WHAT THIS DOES NOT DO: it does not stop a screenshot into a vision model,
// and no client-side code ever can. It raises the cost of the easy path from
// "select, copy, paste" to "write a script that reconstructs order from the
// computed styles" — which is a different kind of person doing a different
// kind of work, and that is the entire goal.
//
// ACCESSIBILITY: the container carries aria-label with the real text, so a
// screen reader user can still play. That does leave the plaintext in the
// accessibility tree. It is a deliberate, accepted hole — the alternative is
// locking those members out of the feature entirely, which is a worse trade
// than one that a screenshot already makes anyway.

const DECOY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@*";

// Deterministic per-render shuffle. Seeded off the text itself rather than
// Math.random so that a re-render of the same payload does not reshuffle and
// force React to rebuild every span — the output is stable for as long as the
// round is, which is exactly the lifetime that matters.
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Piece =
  | { kind: "real"; char: string; order: number; key: string }
  | { kind: "decoy"; char: string; key: string };

function buildPieces(text: string): Piece[] {
  const rand = mulberry(seedFrom(text));
  const pieces: Piece[] = [];

  for (let i = 0; i < text.length; i++) {
    pieces.push({ kind: "real", char: text[i], order: i, key: `r${i}` });
    // Roughly one decoy per three real characters. Enough that a scrape is
    // unusable, few enough that the DOM does not balloon on a 400-character
    // hexdump.
    if (rand() < 0.34) {
      const junk = DECOY_ALPHABET[Math.floor(rand() * DECOY_ALPHABET.length)];
      pieces.push({ kind: "decoy", char: junk, key: `d${i}` });
    }
  }

  // Fisher-Yates over the emission order. `order` on the real pieces is what
  // restores the reading sequence visually, so the DOM sequence is free.
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  return pieces;
}

// Render `text` so it reads normally and scrapes badly.
//
// Use it for puzzle bodies whose text is directly promptable — a ciphertext, a
// memory dump, a record table. Do NOT use it for the brief, the rules, or any
// chrome: those need to stay copyable for a player asking a teammate what a
// rule means, and they give a solver nothing on their own.
export function Glyphs({ text }: { text: string }) {
  const pieces = useMemo(() => buildPieces(text), [text]);
  return (
    <span className="hack-glyphs" aria-label={text}>
      {pieces.map((piece) =>
        piece.kind === "decoy" ? (
          <span key={piece.key} className="hack-decoy" aria-hidden>
            {piece.char}
          </span>
        ) : (
          <span key={piece.key} style={{ order: piece.order }} aria-hidden>
            {piece.char}
          </span>
        )
      )}
    </span>
  );
}
