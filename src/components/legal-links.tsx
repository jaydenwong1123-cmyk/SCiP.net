import Link from "next/link";
import { DISCORD_INVITE_URL } from "@/lib/links";

// Privacy Policy / Terms of Service links for the bottom banner of every
// screen. Both pages sit outside the auth gate (see PUBLIC_PATHS in proxy.ts),
// so a visitor can read them before registering.
export function LegalLinks() {
  return (
    <>
      <Link href="/privacy" className="term-link">
        PRIVACY
      </Link>
      <span aria-hidden>{"//"}</span>
      <Link href="/terms" className="term-link">
        TERMS
      </Link>
      <span aria-hidden>{"//"}</span>
      <a
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="term-link"
      >
        DISCORD
      </a>
    </>
  );
}
