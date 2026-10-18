import { randomInt } from "crypto";

// The two kinds of out-of-roleplay code.
//
//   signup  entered at /enlist to create ONE Chaos Insurgency account
//   launch  entered in the /insurgency portal to start ONE siege
//
// Generated on demand by an owner from /admin/insurgency and spent on use —
// see code-store.ts. This file is the pure half: the format, the generator and
// the normalization, so they can be tested without a database.

export type CiCodeKind = "signup" | "launch";

export const CI_CODE_KINDS: readonly CiCodeKind[] = ["signup", "launch"];

export const CI_CODE_LABELS: Record<CiCodeKind, string> = {
  signup: "ENLIST CODE",
  launch: "LAUNCH CODE",
};

const PREFIX: Record<CiCodeKind, string> = { signup: "ENLIST", launch: "SIEGE" };

// No 0/O, 1/I/L: these get read aloud and copied by hand.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function group(length: number, rand: (max: number) => number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[rand(ALPHABET.length)];
  return out;
}

// e.g. ENLIST-7K2Q-9XMV. Two groups of four from a 31-symbol alphabet is ~40
// bits, which is plenty for a one-use code behind a rate limit.
export function generateCiCode(
  kind: CiCodeKind,
  rand: (max: number) => number = randomInt
): string {
  return `${PREFIX[kind]}-${group(4, rand)}-${group(4, rand)}`;
}

export function isCiCodeKind(value: string): value is CiCodeKind {
  return value === "signup" || value === "launch";
}

// Codes are typed by hand, so case and surrounding whitespace are forgiven.
export function normalizeCiCode(code: string): string {
  return code.trim().toUpperCase();
}
