import "dotenv/config";
import crypto from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";

// Baseline an EXISTING database against the migration history.
//
// WHY THIS SCRIPT EXISTS. Until now this project deployed with
// `prisma db push --accept-data-loss`, which builds the schema without
// recording anything, so every existing database — local dev and the live
// Turso instance both — already has all 27 tables and no `_prisma_migrations`
// table to say where they came from. Pointing `migrate deploy` at one of those
// fails with P3005 ("database schema is not empty").
//
// The documented fix is `prisma migrate resolve --applied 0_init`. That command
// does not work in this project: it needs `_prisma_migrations` to already
// exist, and it cannot create it through the libSQL driver adapter (the same
// class of limitation that blocks `migrate diff --shadow-database-url` here).
// So this does the two things `resolve` would have done, directly:
//
//   1. create `_prisma_migrations` if it is missing, and
//   2. record the named migrations as already applied, with the checksums
//      Prisma will verify on the next deploy.
//
// IDEMPOTENT, AND IT RUNS IN THE BUILD. `npm run build` invokes this before
// `prisma migrate deploy`, so a database in the db-push state heals itself on
// the next deploy rather than needing a human with production credentials to
// go and fix it by hand. Every case is a no-op except the one it exists for:
//
//   already baselined  → skips, exit 0
//   empty database     → nothing to baseline; migrate deploy builds it, exit 0
//   db-push database   → records 0_init as applied, exit 0
//
// It can also be run directly, against whatever DATABASE_URL points at:
//
//   npm run db:baseline
//   DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npm run db:baseline
//
// SAFETY. Marking a migration applied WITHOUT its DDL having run would leave
// the database silently behind the schema — so this only ever baselines a
// database that visibly ALREADY HAS 0_init's tables. It checks several of them
// spread across the schema, not one, so a half-built database is refused rather
// than being recorded as complete.

// Migrations to mark as applied. Only the initial one belongs here — it is the
// only migration whose effects a db-push database already has.
const BASELINE = ["0_init"] as const;

// Tables 0_init creates, sampled from across the schema. All of them must be
// present before this will record 0_init as applied.
const SENTINEL_TABLES = ["User", "ScpFile", "HackRun", "AuditLog", "SiteConfig"];

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

function checksum(sql: string): string {
  // Prisma stores the SHA-256 of the migration file's bytes, hex encoded, and
  // re-verifies it on every deploy. A mismatch here would make the next deploy
  // fail with "migration was modified after it was applied".
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

async function main() {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  console.log(`[baseline] target: ${url}`);

  const found = await db.execute({
    sql: `SELECT name FROM sqlite_master WHERE type='table' AND name IN (${SENTINEL_TABLES.map(
      () => "?"
    ).join(",")})`,
    args: SENTINEL_TABLES,
  });
  const present = new Set(found.rows.map((r) => String(r.name)));

  if (present.size === 0) {
    // A brand-new database. Not an error: `migrate deploy` will build it from
    // 0_init in a moment, which is exactly right. Exiting 0 keeps this usable
    // as a build step.
    console.log(
      "[baseline] empty database — nothing to baseline; migrate deploy will build it."
    );
    return;
  }

  const missing = SENTINEL_TABLES.filter((t) => !present.has(t));
  if (missing.length > 0) {
    // Some of 0_init's tables but not all. Recording 0_init as applied here
    // would permanently skip the DDL that creates the rest.
    console.error(
      `[baseline] REFUSING: this database is partially built — missing ${missing.join(
        ", "
      )}.\n[baseline] Resolve it by hand; baselining would hide the gap rather than close it.`
    );
    process.exit(1);
  }

  // Prisma's own bookkeeping table, verbatim. Created here only because
  // `migrate resolve` cannot create it through the driver adapter.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id"                    TEXT PRIMARY KEY NOT NULL,
      "checksum"              TEXT NOT NULL,
      "finished_at"           DATETIME,
      "migration_name"        TEXT NOT NULL,
      "logs"                  TEXT,
      "rolled_back_at"        DATETIME,
      "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
    )
  `);

  const known = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  let recorded = 0;

  for (const name of BASELINE) {
    if (!known.some((e) => e.isDirectory() && e.name === name)) {
      console.error(`[baseline] no such migration directory: ${name}`);
      process.exit(1);
    }

    const already = await db.execute({
      sql: 'SELECT id FROM "_prisma_migrations" WHERE migration_name = ?',
      args: [name],
    });
    if (already.rows.length > 0) {
      console.log(`[baseline] ${name} — already recorded, skipping`);
      continue;
    }

    const sql = await readFile(
      path.join(MIGRATIONS_DIR, name, "migration.sql"),
      "utf8"
    );

    await db.execute({
      sql: `INSERT INTO "_prisma_migrations"
              (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
            VALUES (?, ?, current_timestamp, ?, NULL, NULL, current_timestamp, 1)`,
      args: [crypto.randomUUID(), checksum(sql), name],
    });
    console.log(`[baseline] ${name} — marked applied`);
    recorded += 1;
  }

  console.log(
    recorded === 0
      ? "[baseline] nothing to do; this database was already baselined."
      : `[baseline] done. Run "npm run db:deploy" to apply everything after the baseline.`
  );
}

main()
  .catch((err) => {
    console.error("[baseline] failed:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
