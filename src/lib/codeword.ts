const WORDS = [
  "raven", "cipher", "vector", "cinder", "hollow", "static", "ember", "quartz",
  "phantom", "relic", "tundra", "gambit", "echo", "nexus", "vault", "shroud",
  "onyx", "cobalt", "wraith", "signal", "drift", "husk", "obelisk", "tally",
  "marrow", "ashen", "grit", "lumen", "cache", "warden", "brine", "flux",
];

function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function randomDigits(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 10);
  }
  return out;
}

export function generateCodeword(): string {
  return `${randomWord()}-${randomWord()}-${randomDigits(3)}`;
}

export function generateInviteCode(): string {
  return `${randomWord()}-${randomWord()}-${randomDigits(4)}`.toUpperCase();
}
