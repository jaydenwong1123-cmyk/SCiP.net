import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyDiscordRequest } from "./verify";
import { parseCustomId, promoButtonId } from "@/lib/engine/embeds";

// The signature check.
//
// This is the only thing standing between the interactions endpoint and anyone
// who has guessed the URL — there is no session on that route — so it is tested
// against a REAL Ed25519 keypair rather than a stub. If these pass, the same
// bytes Discord signs are the bytes this verifies.

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

/** The raw 32-byte public key, hex encoded — exactly the form the Discord
 *  developer portal hands out. */
const publicKeyHex = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(-32)
  .toString("hex");

function signedAs(body: string, timestamp: string): string {
  return sign(null, Buffer.from(timestamp + body, "utf8"), privateKey).toString(
    "hex"
  );
}

const BODY = JSON.stringify({ type: 2, data: { name: "leaderboard" } });
const TS = "1758153600";

describe("verifyDiscordRequest", () => {
  it("accepts a correctly signed request", () => {
    expect(
      verifyDiscordRequest(BODY, signedAs(BODY, TS), TS, publicKeyHex)
    ).toBe(true);
  });

  it("rejects a body altered after signing", () => {
    const signature = signedAs(BODY, TS);
    const tampered = JSON.stringify({ type: 2, data: { name: "engine" } });
    expect(verifyDiscordRequest(tampered, signature, TS, publicKeyHex)).toBe(
      false
    );
  });

  it("rejects a replayed signature under a different timestamp", () => {
    // The timestamp is part of the signed message, which is what makes it
    // meaningful rather than decorative.
    expect(
      verifyDiscordRequest(BODY, signedAs(BODY, TS), "1758153601", publicKeyHex)
    ).toBe(false);
  });

  it("rejects a signature from a different key", () => {
    const other = generateKeyPairSync("ed25519");
    const foreign = sign(
      null,
      Buffer.from(TS + BODY, "utf8"),
      other.privateKey
    ).toString("hex");
    expect(verifyDiscordRequest(BODY, foreign, TS, publicKeyHex)).toBe(false);
  });

  it("fails closed on missing headers or an unset public key", () => {
    const signature = signedAs(BODY, TS);
    expect(verifyDiscordRequest(BODY, null, TS, publicKeyHex)).toBe(false);
    expect(verifyDiscordRequest(BODY, signature, null, publicKeyHex)).toBe(false);
    expect(verifyDiscordRequest(BODY, signature, TS, undefined)).toBe(false);
    expect(verifyDiscordRequest(BODY, signature, TS, "")).toBe(false);
  });

  it("returns false — never throws — on malformed hex", () => {
    // A prober sending junk should get the same flat rejection as a bad
    // signature, not a 500 that tells them their input got further.
    expect(verifyDiscordRequest(BODY, "zzzz", TS, publicKeyHex)).toBe(false);
    expect(verifyDiscordRequest(BODY, "abc", TS, publicKeyHex)).toBe(false);
    expect(verifyDiscordRequest(BODY, signedAs(BODY, TS), TS, "00ff")).toBe(
      false
    );
  });
});

describe("parseCustomId", () => {
  it("round-trips a promotion button id", () => {
    const parsed = parseCustomId(promoButtonId("approve", "req_123"));
    expect(parsed).toEqual({ area: "promo", verb: "approve", id: "req_123" });
  });

  it("carries the announcement's colour and channel", () => {
    // The composer has nowhere else to put them: a modal submission carries
    // nothing forward from the command that opened it except this string.
    expect(parseCustomId("engine:say:denied:999000999000999000")).toEqual({
      area: "say",
      verb: "denied",
      id: "999000999000999000",
    });
  });

  it("ignores ids belonging to anything else", () => {
    expect(parseCustomId("something:else:entirely:here")).toBeNull();
    expect(parseCustomId("engine:promo:approve")).toBeNull();
    expect(parseCustomId("")).toBeNull();
  });
});
