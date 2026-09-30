import Link from "next/link";
import { LegalLinks } from "@/components/legal-links";

export type LegalSection = {
  heading: string;
  body: React.ReactNode;
};

// Shared shell for /privacy and /terms. Standalone like the root 404: no
// command rail, no session and no database, so the pages render for signed-out
// visitors and stay reachable during maintenance or a shutdown.
//
// The text is set in normal case rather than the console's uppercase so a
// visitor can actually read it.
export function LegalPage({
  title,
  effectiveDate,
  sections,
}: {
  title: string;
  effectiveDate: string;
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--ts">
        <span>SCiP.net</span>
        <span aria-hidden>{"//"}</span>
        <span>{title}</span>
      </div>

      <div className="flex-1 flex justify-center p-4">
        <article className="term-panel w-full max-w-3xl space-y-5 p-6 normal-case">
          <header className="space-y-1">
            <h1
              className="text-lg text-[var(--term-amber)] uppercase"
              style={{ letterSpacing: "0.18em" }}
            >
              {title}
            </h1>
            <p className="text-sm text-[var(--term-fg-dim)]">
              Effective date: {effectiveDate}
            </p>
          </header>

          {sections.map((s) => (
            <section key={s.heading} className="space-y-2 text-sm leading-relaxed">
              <h2 className="text-[var(--term-fg-bright)]">{s.heading}</h2>
              {s.body}
            </section>
          ))}

          <div className="pt-2">
            <Link href="/" className="term-button">
              [RETURN TO ACCESS POINT]
            </Link>
          </div>
        </article>
      </div>

      <footer className="hud-banner hud-banner--ts flex-wrap">
        <LegalLinks />
      </footer>
    </div>
  );
}
