import Link from "next/link";

// Root 404: a URL that matched no route at all.
//
// Distinct from (app)/not-found.tsx, which handles a station calling
// notFound() for a record. This one is reached by unauthenticated visitors and
// mistyped paths, so it renders standalone inside the root layout — no command
// rail, no session, no database. Same classification bracketing as the auth
// screens, so a stray URL still meets the facility's posture.
export default function RootNotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--ts">
        <span>TOP SECRET</span>
        <span aria-hidden>{"//"}</span>
        <span>SCiP-147</span>
        <span aria-hidden>{"//"}</span>
        <span>AUTHORIZED PERSONNEL ONLY</span>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="term-panel w-full max-w-md space-y-4 text-center p-6">
          <div className="hud-recid">SCiP-147 // ROUTING FAULT</div>
          <h1
            className="text-lg text-[var(--term-amber)]"
            style={{ letterSpacing: "0.18em" }}
          >
            NODE NOT ON THIS NETWORK
          </h1>
          <p className="text-sm">
            THE ADDRESS YOU REQUESTED DOES NOT RESOLVE TO A STATION ON THIS
            TERMINAL.
          </p>
          <p className="text-sm text-[var(--term-fg-dim)]">
            CHECK THE ADDRESS, OR RETURN TO THE ACCESS POINT.
          </p>
          <div className="pt-1">
            <Link href="/" className="term-button">
              [RETURN TO ACCESS POINT]
            </Link>
          </div>
        </div>
      </div>

      <div className="hud-banner hud-banner--ts">
        <span>ALL ACCESS ATTEMPTS ARE LOGGED AND TRACED</span>
      </div>
    </div>
  );
}
