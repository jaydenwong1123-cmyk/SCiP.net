// One-off: personnel-dossier attachments are now retained indefinitely, so
// clear the expiry that existing rows were created with. Safe to re-run.
//
// Run with `npm run db:backfill-personnel-expiry`, against whatever
// DATABASE_URL points at:
//
//   DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..." npm run db:backfill-personnel-expiry
//
// Still needed despite the migration history: this changes DATA, not schema,
// and a database restored from a backup taken before the retention rule
// changed will carry the old expiries back in with it.
import "dotenv/config";
import { db } from "../src/lib/db";

async function main() {
  const result = await db.attachment.updateMany({
    where: { entityType: "personnel" },
    data: { expiresAt: null },
  });
  console.log(`Cleared expiry on ${result.count} personnel attachment(s).`);
}

main()
  .catch((err) => {
    console.error("[backfill] failed:", err);
    process.exit(1);
  })
  .then(() => process.exit(0));
