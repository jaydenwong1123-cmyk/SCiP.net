// Random source for puzzle generation.
//
// Injected rather than reaching for Math.random directly so the games are
// unit-testable: pass a seed and a generator produces the same puzzle every
// time, which is the only practical way to assert that a grader accepts its
// own answer key.
//
// The seeded path is for TESTS ONLY. Puzzles issued to a real run always use
// the unseeded default — a stored seed would be a solution in disguise, since
// anyone holding it could re-derive both the answer and the game that was
// drawn. See the comment on HackChallenge.solution in schema.prisma.
export type Rng = {
  next(): number;
  // Inclusive on both ends.
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  // n distinct items, or the whole list shuffled when n exceeds its length.
  sample<T>(items: readonly T[], n: number): T[];
  bool(probability?: number): boolean;
  hexByte(): string;
};

// mulberry32 — small, fast, and good enough for puzzle shuffling. Not for
// anything security-bearing; nonces use crypto.randomUUID instead.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed?: number): Rng {
  const next = seed === undefined ? Math.random : mulberry32(seed);

  const rng: Rng = {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    sample(items, n) {
      return rng.shuffle(items).slice(0, Math.min(n, items.length));
    },
    bool(probability = 0.5) {
      return next() < probability;
    },
    hexByte() {
      return rng.int(0, 255).toString(16).toUpperCase().padStart(2, "0");
    },
  };

  return rng;
}
