import { NextResponse } from "next/server";
import { getRealUser } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { ciVisibleTo, ciEnabled } from "@/lib/ci/access";
import { hintSaysQuiet } from "@/lib/ci/siege";
import { siegeFeed } from "@/lib/ci/siege-store";

export const dynamic = "force-dynamic";

// CHAOS INSURGENCY SIEGE — the live feed the banner, the CI portal and the
// RAISA desk poll.
//
// Answers 204 for "nothing for you", whatever the reason: feature off, viewer
// not an early-access tester, signed out, or simply no siege. The singleton
// config is checked before the viewer is looked up, so the common case — no
// siege anywhere — never touches the user table.
//
// Settling an expired siege happens here as a side effect (through
// siegeFeed → getSiegeSnapshot), which is what makes a siege end on time
// with no scheduler.
export async function GET() {
  const empty = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, private" },
  });

  const cfg = await getSiteConfig();
  if (!ciEnabled(cfg) || hintSaysQuiet(cfg, new Date())) return empty;

  const user = await getRealUser();
  if (!user || user.suspended) return empty;

  const feed = await siegeFeed(ciVisibleTo(user, cfg));
  if (!feed) return empty;

  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store, private" } });
}
