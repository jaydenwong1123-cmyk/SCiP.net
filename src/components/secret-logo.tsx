"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SecretTerminal } from "@/components/secret-terminal";

// Click SCiP.NET 15 times within 10 seconds to open the hidden terminal.
const REQUIRED_CLICKS = 15;
const WINDOW_MS = 10_000;

export function SecretLogo() {
  const router = useRouter();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const clickTimes = useRef<number[]>([]);

  function handleClick(e: React.MouseEvent) {
    // Preserve the normal "go to menu" behavior on a plain click, but track the
    // rapid-click cadence for the easter egg.
    const now = Date.now();
    const recent = clickTimes.current.filter((t) => now - t < WINDOW_MS);
    recent.push(now);
    clickTimes.current = recent;

    if (recent.length >= REQUIRED_CLICKS) {
      clickTimes.current = [];
      e.preventDefault();
      setTerminalOpen(true);
      return;
    }

    // Soft-navigate to the menu without a full reload so this component (and its
    // click history) stays mounted for the next click.
    e.preventDefault();
    router.push("/menu");
  }

  return (
    <>
      <a
        href="/menu"
        onClick={handleClick}
        className="text-base sm:text-lg tracking-widest term-link select-none"
      >
        SCiP.NET
      </a>
      {terminalOpen && <SecretTerminal onClose={() => setTerminalOpen(false)} />}
    </>
  );
}
