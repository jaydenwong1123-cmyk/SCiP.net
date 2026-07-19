import "dotenv/config";
import { defineConfig } from "prisma/config";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

export default defineConfig({
  // Route the Prisma CLI's schema engine (used by `db push`) through the
  // libSQL driver adapter, so it can talk to Turso (libsql://) the same way
  // the app runtime does. Without this the CLI rejects non-`file:` URLs.
  experimental: { adapter: true },
  engine: "js",
  schema: "prisma/schema.prisma",
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
  adapter: async () =>
    new PrismaLibSQL({
      url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
      authToken: process.env.TURSO_AUTH_TOKEN,
    }),
});
