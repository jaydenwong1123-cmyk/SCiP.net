import { NextResponse } from "next/server";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import type { Interaction } from "@/lib/discord/types";
import { handleInteraction } from "@/lib/engine/handlers";

// THE ENGINE — the Discord bot's front door.
//
// Discord does not hold a socket open to this app. Every slash command, button
// press and modal submission arrives here as a signed POST, and whatever this
// route returns is what the member sees. That is what makes a bot possible on
// a serverless deployment at all: there is no process to keep alive, and the
// bot is exactly as available as the website is.
//
// Never prerendered, never cached — every request is a distinct signed message.
export const dynamic = "force-dynamic";

// Interactions are answered on the Node runtime: the signature check uses
// node:crypto and the handlers reach Turso through Prisma's libSQL adapter.
export const runtime = "nodejs";

export async function POST(request: Request) {
  // The raw body, read BEFORE anything parses it. The signature covers these
  // exact bytes; a body that has been through JSON.parse and re-serialised will
  // not verify, even when it is semantically identical.
  const rawBody = await request.text();

  const valid = verifyDiscordRequest(
    rawBody,
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
    process.env.DISCORD_PUBLIC_KEY
  );

  // 401 is not merely convention here: Discord tests this endpoint with
  // deliberately bad signatures when the URL is saved, and refuses the URL
  // unless those are rejected with a 401.
  if (!valid) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return new NextResponse("malformed payload", { status: 400 });
  }

  try {
    const response = await handleInteraction(interaction);
    return NextResponse.json(response);
  } catch (err) {
    // A thrown error would surface to the member as "The application did not
    // respond", with nothing to act on and no trace of what happened. An
    // ephemeral sentence and a server-side log is strictly better.
    console.error("[engine] interaction failed", err);
    return NextResponse.json({
      type: 4,
      data: {
        content:
          "The Engine hit an internal fault handling that. It has been logged.",
        flags: 1 << 6,
      },
    });
  }
}
