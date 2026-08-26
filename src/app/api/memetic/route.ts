import { NextResponse } from "next/server";
import { getRealUser } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { memeticFor } from "@/lib/memetic";

// Never prerendered and never cached: the whole point is that the answer
// changes the instant the overseer fires or recalls.
export const dynamic = "force-dynamic";

// MEMETIC AGENT — the delivery channel.
//
// The overlay polls this every few seconds and asks one question: is there an
// exposure aimed at me right now? Answering per-viewer rather than handing out
// the whole exposure is what keeps this from being a way for anyone to learn
// who else is under one.
//
// getRealUser, not getCurrentUser: an exposure is aimed at an ACCOUNT, and a
// member sitting in a "view as" simulation is still the same person at the same
// screen. Routing this through the simulated persona would let a target dodge
// it by pretending to be someone else.
//
// A denial answers 204 rather than 401/404 — the same shape as "nothing for
// you". A signed-out or expired session polling in a stale tab is not an error
// worth surfacing, and the overlay treats every non-200 identically anyway.
export async function GET() {
  const empty = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, private" },
  });

  const user = await getRealUser();
  if (!user || user.suspended) return empty;

  const cfg = await getSiteConfig();
  const exposure = memeticFor(cfg, user.id);
  if (!exposure) return empty;

  return NextResponse.json(
    {
      // The catalogue is resolved server-side and the resolved values are sent,
      // so the client never has to trust — or look up — a slug of its own.
      agent: exposure.agent.slug,
      label: exposure.agent.label,
      src: exposure.agent.src,
      periodMs: exposure.cadence.periodMs,
      // Epoch ms. The overlay counts down to this on its own clock, so the
      // exposure still ends on time if polling stops.
      endsAt: exposure.endsAt,
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
