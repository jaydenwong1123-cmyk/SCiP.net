import Link from "next/link";

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
    </>
  );
}
