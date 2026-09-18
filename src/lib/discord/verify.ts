import { createPublicKey, verify as verifySignature } from "node:crypto";

// Every interaction Discord sends is signed with the application's Ed25519 key,
// and Discord requires the endpoint to reject an unsigned or badly signed
// request with 401 before it will even accept the URL. That check is the ONLY
// thing standing between this route and anyone on the internet who has guessed
// it — there is no session here — so it fails closed at every step.
//
// Done with node:crypto rather than a library. Discord hands out the public key
// as 32 raw hex-encoded bytes, and node:crypto only imports Ed25519 keys in
// SPKI/DER form, so the raw key is wrapped in the 12-byte DER prefix that says
// "this is an Ed25519 public key". That prefix is fixed by RFC 8410; it never
// varies, which is why this is a constant rather than a DER encoder.
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function hexToBuffer(hex: string): Buffer | null {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) return null;
  return Buffer.from(hex, "hex");
}

/**
 * Verify one interaction request.
 *
 * `rawBody` must be the request body exactly as it arrived — the signature
 * covers the bytes, so anything that has been through JSON.parse and back will
 * not verify.
 */
export function verifyDiscordRequest(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  publicKeyHex: string | undefined
): boolean {
  if (!signature || !timestamp || !publicKeyHex) return false;

  const sig = hexToBuffer(signature);
  const key = hexToBuffer(publicKeyHex);
  if (!sig || sig.length !== 64) return false;
  if (!key || key.length !== 32) return false;

  try {
    const publicKey = createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, key]),
      format: "der",
      type: "spki",
    });

    // Ed25519 signs the raw message; the algorithm argument is null because the
    // digest is part of the scheme itself.
    return verifySignature(
      null,
      Buffer.from(timestamp + rawBody, "utf8"),
      publicKey,
      sig
    );
  } catch {
    // A malformed key or signature must read as "not verified", never as a 500:
    // an exception here would tell a prober that their input got further than a
    // plain rejection does.
    return false;
  }
}
