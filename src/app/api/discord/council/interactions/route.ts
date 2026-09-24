import { NextResponse } from "next/server";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import type { Interaction } from "@/lib/discord/types";
import { handleInteraction } from "@/lib/council/handlers";

// THE COUNCIL — the second bot's front door.
//
// A separate Discord application from The Engine, so it signs with its own key
// and is answered here rather than at /api/discord/interactions. Everything
// else about the contract is identical; see that route for the reasoning.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Read raw: the signature covers these exact bytes.
  const rawBody = await request.text();

  const valid = verifyDiscordRequest(
    rawBody,
    request.headers.get("x-signature-ed25519"),
    request.headers.get("x-signature-timestamp"),
    process.env.COUNCIL_PUBLIC_KEY
  );
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
    return NextResponse.json(await handleInteraction(interaction));
  } catch (err) {
    console.error("[council] interaction failed", err);
    return NextResponse.json({
      type: 4,
      data: {
        content:
          "The Council hit an internal fault handling that. It has been logged.",
        flags: 1 << 6,
      },
    });
  }
}
