import Link from "next/link";
import { LegalLinks } from "@/components/legal-links";
import { DISCORD_INVITE_URL } from "@/lib/links";
import { CLEARANCE_LEVELS, clearanceAccent } from "@/lib/clearance";

// The public front door, shown at "/" to anyone who is not signed in.
//
// Until this existed a visitor met a login form and nothing else, so a link to
// the site told an outsider nothing and gave them nowhere to go. This says
// what the terminal is and how to get in.
//
// STATIC ON PURPOSE. No database read, no member count, no record titles:
// nothing on this page comes from behind the login, so nothing behind the
// login can leak through it. Keep it that way; anything "live" belongs on the
// station board. It also says nothing about the unknown terminal, which is
// meant to be found, not advertised.
const FEATURES = [
  {
    code: "SEC-03",
    title: "ANOMALY ARCHIVE",
    body: "Containment files written by members, each locked to a clearance level. What you can read depends on the rank you hold.",
  },
  {
    code: "SEC-01",
    title: "PERSONNEL FILES",
    body: "Every member has a dossier: department, record, and the clearance they have earned.",
  },
  {
    code: "SEC-08",
    title: "FORUMS & MESSAGES",
    body: "Discussion threads and private correspondence, in character, with redaction for what not everyone should see.",
  },
  {
    code: "SEC-04",
    title: "INCIDENTS & BROADCASTS",
    body: "Breach reports filed as they happen and site-wide directives from command.",
  },
];

const STEPS = [
  "Join the Discord server.",
  "Ask staff there for an invite code.",
  "Register here with the code and receive your credentials.",
];

export function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--ts">
        <span>SCiP.NET</span>
        <span aria-hidden>{"//"}</span>
        <span>FACILITY-NULL</span>
        <span aria-hidden>{"//"}</span>
        <span>AUTHORIZED PERSONNEL ONLY</span>
      </div>

      <main className="flex-1 flex justify-center p-4">
        <div className="w-full max-w-4xl flex flex-col gap-[var(--term-gap)] py-4 sm:py-10">
          <section className="term-panel space-y-4 p-5 sm:p-8">
            <div className="hud-recid">SCiP-NULL // PUBLIC ACCESS NOTICE</div>
            <h1
              className="text-2xl sm:text-4xl text-[var(--term-fg-bright)]"
              style={{ letterSpacing: "0.14em" }}
            >
              SECURE. CONTAIN. PROTECT.
            </h1>
            <p className="text-sm sm:text-base max-w-2xl normal-case">
              SCiP.net is the member terminal of an SCP Foundation roleplay
              faction. Inside is a working records system: an archive of
              anomalies, personnel files, incident reports and forums, all
              gated by a seven-level clearance ladder you climb as a member.
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="term-button"
              >
                JOIN THE DISCORD
              </a>
              <Link href="/login" className="term-button term-button--ghost">
                MEMBER LOGIN
              </Link>
              <Link href="/register" className="term-button term-button--ghost">
                REGISTER WITH INVITE CODE
              </Link>
            </div>
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--term-gap)]">
            {FEATURES.map((f) => (
              <div key={f.code} className="term-panel space-y-2">
                <div className="hud-panel-head">
                  <span className="hud-panel-head__code">{f.code}</span>
                  <span>{f.title}</span>
                </div>
                <p className="text-sm text-[var(--term-fg-dim)] normal-case">
                  {f.body}
                </p>
              </div>
            ))}
          </section>

          <section className="term-panel space-y-3">
            <div className="hud-panel-head">
              <span className="hud-panel-head__code">CLR</span>
              <span>THE CLEARANCE LADDER</span>
              <span className="hud-panel-head__status">7 LEVELS</span>
            </div>
            <p className="text-sm text-[var(--term-fg-dim)] normal-case">
              Everyone starts at L-1. Higher levels open more of the archive
              and reveal text that is blacked out for everyone below.
            </p>
            <ol className="list-none flex flex-wrap gap-2 text-xs">
              {CLEARANCE_LEVELS.map((l) => (
                <li
                  key={l.rank}
                  className="clearance-chip"
                  style={{ ["--term-clearance" as string]: clearanceAccent(l.rank) }}
                >
                  {l.label} {l.name}
                </li>
              ))}
            </ol>
          </section>

          <section className="term-panel space-y-3">
            <div className="hud-panel-head">
              <span className="hud-panel-head__code">ENL</span>
              <span>HOW TO GET ACCESS</span>
              <span className="hud-panel-head__status">INVITE ONLY</span>
            </div>
            <ol className="list-none space-y-2 text-sm normal-case">
              {STEPS.map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="hud-recid shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="term-button inline-block"
            >
              JOIN THE DISCORD
            </a>
          </section>
        </div>
      </main>

      <div className="hud-banner hud-banner--ts flex-wrap">
        <span>A FAN ROLEPLAY COMMUNITY · NOT AFFILIATED WITH THE SCP WIKI</span>
        <span aria-hidden>{"//"}</span>
        <LegalLinks />
      </div>
    </div>
  );
}
