// One-off: personnel-dossier attachments are now retained indefinitely, so
// clear the expiry that existing rows were created with. Safe to re-run.
import { db } from "../src/lib/db";

async function main() {
  const result = await db.attachment.updateMany({
    where: { entityType: "personnel" },
    data: { expiresAt: null },
  });
  console.log(`Cleared expiry on ${result.count} personnel attachment(s).`);
}

main();
