import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Test runner config.
//
// Deliberately minimal. The modules under test are the PURE ones — the puzzle
// registry, the conduct scorer, the clearance resolver, the redaction parser —
// none of which touch the database, the session or the clock. That is a
// property the code already had by design (see the contract comment in
// lib/hack/games/types.ts); this config exists to cash it in rather than to
// stand up a test database.
//
// No jsdom, no setup file, no globals: tests import { describe, it, expect }
// explicitly so a reader can see where they come from. Add an environment only
// when there is a component test that actually needs one.
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" path in tsconfig.json. Set by hand rather than
      // pulling in vite-tsconfig-paths — one alias is not worth a dependency.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // The puzzle-generator tests sweep every game across every band many times
    // over; they are still fast, but not instant.
    testTimeout: 20_000,
  },
});
