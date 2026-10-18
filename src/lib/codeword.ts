import { randomInt } from "crypto";

const WORDS = [
  "raven", "cipher", "vector", "cinder", "hollow", "static", "ember", "quartz",
  "phantom", "relic", "tundra", "gambit", "echo", "nexus", "vault", "shroud",
  "onyx", "cobalt", "wraith", "signal", "drift", "husk", "obelisk", "tally",
  "marrow", "ashen", "grit", "lumen", "cache", "warden", "brine", "flux",
];

// crypto.randomInt rather than Math.random: these become account passwords
// and invite codes, so they must not be predictable from earlier output.
function randomWord(): string {
  return WORDS[randomInt(WORDS.length)];
}

function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += randomInt(10);
  }
  return out;
}

// Four words and four digits: 32^4 * 10^4, about 10 billion codewords. The
// old two-words-three-digits form was only ~1 million, small enough that the
// login throttle was the only thing between an attacker and a guess.
export function generateCodeword(): string {
  return `${randomWord()}-${randomWord()}-${randomWord()}-${randomWord()}-${randomDigits(4)}`;
}

export function generateInviteCode(): string {
  return `${randomWord()}-${randomWord()}-${randomDigits(4)}`.toUpperCase();
}
