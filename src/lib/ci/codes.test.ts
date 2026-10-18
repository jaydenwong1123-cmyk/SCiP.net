import { describe, it, expect } from "vitest";
import { generateCiCode, normalizeCiCode, isCiCodeKind } from "./codes";

describe("generateCiCode", () => {
  it("prefixes by kind and uses two groups of four", () => {
    expect(generateCiCode("signup")).toMatch(/^ENLIST-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(generateCiCode("launch")).toMatch(/^SIEGE-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
  it("never uses look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCiCode("signup").slice(7)).not.toMatch(/[01OIL]/);
    }
  });
  it("does not repeat across draws", () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateCiCode("launch")));
    expect(seen.size).toBe(500);
  });
  it("is deterministic under an injected source", () => {
    expect(generateCiCode("signup", () => 0)).toBe("ENLIST-AAAA-AAAA");
  });
});

describe("normalizeCiCode", () => {
  it("forgives case and surrounding whitespace", () => {
    expect(normalizeCiCode("  enlist-7k2q-9xmv ")).toBe("ENLIST-7K2Q-9XMV");
  });
});

describe("isCiCodeKind", () => {
  it("knows the two kinds", () => {
    expect(isCiCodeKind("signup")).toBe(true);
    expect(isCiCodeKind("launch")).toBe(true);
    expect(isCiCodeKind("admin")).toBe(false);
  });
});
