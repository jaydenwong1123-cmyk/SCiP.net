import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { generateCodeword, generateInviteCode } from "../src/lib/codeword";

const adapter = new PrismaLibSQL({
  url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = new PrismaClient({ adapter });

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL ?? "owner@foundation.scp";

  const existingOwner = await db.user.findUnique({ where: { email: ownerEmail } });
  if (existingOwner) {
    console.log(`Owner account already exists: ${ownerEmail}`);
  } else {
    const password = generateCodeword();
    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.create({
      data: {
        email: ownerEmail,
        passwordHash,
        clearance: 7,
        isOwner: true,
        canPostScp: true,
        canFileIncident: true,
        canLogTest: true,
      },
    });
    console.log("=== OWNER ACCOUNT CREATED ===");
    console.log(`Login:    ${ownerEmail}`);
    console.log(`Password: ${password}`);
    console.log("Save this password now — it will not be shown again.");
  }

  const existingCode = await db.inviteCode.findFirst({ where: { active: true, usedById: null } });
  if (!existingCode) {
    const code = generateInviteCode();
    await db.inviteCode.create({ data: { code } });
    console.log(`Initial invite code: ${code}`);
  } else {
    console.log(`An active invite code already exists: ${existingCode.code}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
