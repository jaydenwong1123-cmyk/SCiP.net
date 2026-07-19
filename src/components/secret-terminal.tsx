"use client";

import { useEffect, useRef, useState } from "react";

type Line = { kind: "in" | "out"; text: string };

const BANNER = [
  "╔══════════════════════════════════════════════╗",
  "║  SCiP.NET // FACILITY-220 MAINTENANCE SHELL    ║",
  "║  UNAUTHORIZED ACCESS IS A CLASS-3 VIOLATION    ║",
  "╚══════════════════════════════════════════════╝",
  "Connection established. Type a command.",
];

// Hidden command set. Intentionally NOT surfaced through any [? HELP] view —
// there is no `help` command and no listing of these anywhere in the UI.
function runCommand(raw: string): { out: string[]; clear?: boolean; close?: boolean } {
  const input = raw.trim();
  if (!input) return { out: [] };
  const [cmd, ...rest] = input.split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd.toLowerCase()) {
    case "whoami":
      return {
        out: [
          "OPERATIVE: [REDACTED]",
          "DESIGNATION: L-R5 (Recordkeeper, rank-6 access)",
          "STATION: Facility-220, Sub-level 4",
        ],
      };
    case "clearance":
      return {
        out: [
          "L-1 .. L-5   standard field ladder",
          "L-O5         Overseer Council",
          "L-E5         Ethics Committee (rank-6)",
          "L-R5         RAISA Recordkeeper (rank-6)",
          "L-OMNI       unrestricted",
        ],
      };
    case "unlock":
      if (arg.toLowerCase() === "facility-220" || arg === "220") {
        return {
          out: [
            "░░ FACILITY-220 CORE UNSEALED ░░",
            "Purpose: long-term anomaly archival & recordkeeping.",
            "Current containment status: NOMINAL.",
          ],
        };
      }
      return { out: [`unlock: unknown target '${arg || "?"}'`] };
    case "scp-914": {
      if (rest[0]?.toLowerCase() === "refine" && rest.length > 1) {
        const text = rest.slice(1).join(" ");
        return { out: [`914 :: refined output → ${text.toUpperCase()}✧`] };
      }
      return { out: ["usage: scp-914 refine <text>"] };
    }
    case "redact":
      return { out: [arg ? arg.replace(/\S/g, "█") : "redact: nothing to redact"] };
    case "decrypt":
      return {
        out: arg
          ? [`decrypting '${arg}'...`, "RESULT: THE ADMINISTRATOR IS WATCHING."]
          : ["decrypt: missing ciphertext"],
      };
    case "keter":
      return {
        out: [
          "⚠ KETER-CLASS PROTOCOL ARMED ⚠",
          "Just kidding. Please do not do that here.",
        ],
      };
    case "sudo":
      return { out: ["PERMISSION DENIED. This incident has been logged."] };
    case "manifest":
      return {
        out: [
          "220-ROSTER: Recordkeeper, Archivist, Custodian, [DATA EXPUNGED]",
        ],
      };
    case "clear":
    case "purge":
      return { out: [], clear: true };
    case "exit":
    case "close":
      return { out: ["Closing secure shell..."], close: true };
    default:
      return { out: [`${cmd}: command not found`] };
  }
}

export function SecretTerminal({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>(BANNER.map((text) => ({ kind: "out", text })));
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const entry = value;
    setValue("");
    const result = runCommand(entry);
    if (result.close) {
      setLines((prev) => [
        ...prev,
        { kind: "in", text: entry },
        ...result.out.map((text) => ({ kind: "out" as const, text })),
      ]);
      setTimeout(onClose, 400);
      return;
    }
    setLines((prev) =>
      result.clear
        ? []
        : [
            ...prev,
            { kind: "in", text: entry },
            ...result.out.map((text) => ({ kind: "out" as const, text })),
          ]
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <div
        className="term-panel w-full max-w-2xl h-[70vh] flex flex-col font-mono text-xs sm:text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="tracking-widest text-[var(--term-fg-bright)]">
            :: FACILITY-220 SHELL ::
          </span>
          <button type="button" onClick={onClose} className="term-button text-xs">
            [CLOSE]
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-0.5 whitespace-pre-wrap">
          {lines.map((l, i) => (
            <div
              key={i}
              className={l.kind === "in" ? "text-[var(--term-fg)]" : "text-[var(--term-fg-dim)]"}
            >
              {l.kind === "in" ? `> ${l.text}` : l.text}
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 mt-2 border-t border-[var(--term-border)]/40 pt-2">
          <span className="text-[var(--term-fg-bright)]">{">"}</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="flex-1 bg-transparent outline-none border-none text-[var(--term-fg)]"
          />
        </form>
      </div>
    </div>
  );
}
