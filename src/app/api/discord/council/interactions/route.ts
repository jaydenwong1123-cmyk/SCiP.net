import { after, NextResponse } from "next/server";
import { verifyDiscordRequest } from "@/lib/discord/verify";
import { isFreshTimestamp } from "@/lib/discord/security";
import {
  InteractionResponseType,
  MessageFlags,
  type Interaction,
  type MessagePayload,
} from "@/lib/discord/types";
import { editOriginalResponse } from "@/lib/discord/rest";
import { handleInteraction, shouldDefer } from "@/lib/council/handlers";

// THE CRIMSON HAND — the second bot's front door.
//
// A separate Discord application from The Engine, so it signs with its own key
// and is answered here rather than at /api/discord/interactions. Everything
// else about the contract is identical; see that route for the reasoning.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  // Read raw: the signature covers these exact bytes.
  const rawBody = await request.text();

  const timestamp = request.headers.get("x-signature-timestamp");
  const valid =
    verifyDiscordRequest(
      rawBody,
      request.headers.get("x-signature-ed25519"),
      timestamp,
      process.env.COUNCIL_PUBLIC_KEY
    ) &&
    // A genuine request replayed later still verifies, so its signed
    // timestamp must also be recent.
    isFreshTimestamp(timestamp, Date.now());
  if (!valid) {
    return new NextResponse("invalid request signature", { status: 401 });
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return new NextResponse("malformed payload", { status: 400 });
  }

  // Slow commands: acknowledge now, finish after the response is sent, and
  // edit the result into the "thinking…" message.
  if (shouldDefer(interaction)) {
    after(async () => {
      let payload: MessagePayload;
      try {
        const res = await handleInteraction(interaction);
        payload = (res.data as MessagePayload | undefined) ?? { content: "Done." };
      } catch (err) {
        console.error("[council] deferred interaction failed", err);
        payload = { content: FAULT };
      }
      const edited = await editOriginalResponse(
        interaction.application_id,
        interaction.token,
        payload
      );
      if (!edited.ok) {
        console.error("[council] could not fill deferred reply", edited.error);
      }
    });
    return NextResponse.json({
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data: { flags: MessageFlags.Ephemeral },
    });
  }

  try {
    return NextResponse.json(await handleInteraction(interaction));
  } catch (err) {
    console.error("[council] interaction failed", err);
    return NextResponse.json({
      type: InteractionResponseType.ChannelMessageWithSource,
      data: { content: FAULT, flags: MessageFlags.Ephemeral },
    });
  }
}

const FAULT = "The Crimson Hand hit an internal fault handling that. It has been logged.";
