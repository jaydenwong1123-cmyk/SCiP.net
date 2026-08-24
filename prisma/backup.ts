import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildBackup, backupFilename } from "../src/lib/backup";

// CLI backup: `npm run db:backup`
//
// Reads whatever DATABASE_URL points at, so exporting production is a matter of
// exporting the production env vars first — the same trick README.md already
// documents for `db:push` and `db:seed`:
//
//   DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npm run db:backup
//
// Unlike the HTTP route this includes attachment BYTES by default. That is the
// whole reason to prefer it: the route has to stay light enough to survive a
// serverless function's memory limit, and this does not.
//
// Flags:
//   --out <dir>       where to write (default ./backups)
//   --no-attachments  metadata only, for a fast structural snapshot
//
// THE OUTPUT IS THE DATABASE. Password hashes, invite codes, the maintenance
// bypass code, private messages, and the run→member links the counter-intel
// reveal ladder exists to protect are all in it. ./backups is gitignored;
// keep it that way, and do not put one of these in a shared drive.

function flagValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1]! : null;
}

async function main() {
  const outDir = path.resolve(flagValue("--out") ?? "backups");
  const includeAttachmentData = !process.argv.includes("--no-attachments");

  console.log(`[backup] reading ${process.env.DATABASE_URL ?? "file:./prisma/dev.db"}`);
  console.log(
    `[backup] attachment data: ${includeAttachmentData ? "INCLUDED" : "omitted"}`
  );

  const backup = await buildBackup({ includeAttachmentData });

  await mkdir(outDir, { recursive: true });
  const file = path.join(outDir, backupFilename(new Date(backup.meta.takenAt)));
  await writeFile(file, JSON.stringify(backup, null, 2), "utf8");

  const total = Object.values(backup.meta.counts).reduce((a, b) => a + b, 0);
  for (const [table, count] of Object.entries(backup.meta.counts)) {
    if (count > 0) console.log(`  ${table.padEnd(24)} ${count}`);
  }
  console.log(`[backup] ${total} rows written to ${file}`);
  console.log(
    "[backup] THIS FILE CONTAINS PASSWORD HASHES AND EVERY PRIVATE MESSAGE. STORE IT ACCORDINGLY."
  );
}

main()
  .catch((err) => {
    console.error("[backup] failed:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
