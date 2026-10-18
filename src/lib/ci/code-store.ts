import { db } from "@/lib/db";
import { generateCiCode, normalizeCiCode, type CiCodeKind } from "./codes";

// Owner-generated, one-use Chaos Insurgency codes.
//
// A code is live while it is neither used nor revoked. Spending one is a
// compare-and-set — updateMany on `usedAt: null` — so two requests racing on the
// same code cannot both get through, the same guard registerAction uses on
// invite codes.

type Actor = { id: string; displayName: string | null; email: string };

function liveWhere(kind: CiCodeKind, code: string) {
  return { kind, code: normalizeCiCode(code), usedAt: null, revokedAt: null };
}

export async function createCiCode(actor: Actor, kind: CiCodeKind): Promise<string> {
  // A collision in ~40 bits is vanishingly rare, but the unique index would
  // throw on one, so retry rather than surface it.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCiCode(kind);
    try {
      await db.ciCode.create({
        data: {
          kind,
          code,
          createdById: actor.id,
          createdByName: actor.displayName ?? actor.email,
        },
      });
      return code;
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  throw new Error("could not generate a unique CI code");
}

// Does this code exist and remain unspent? Used to reject a bad code early,
// before anything else is checked; claimCiCode() is what actually spends it.
export async function isLiveCiCode(kind: CiCodeKind, code: string): Promise<boolean> {
  if (!code.trim()) return false;
  return (await db.ciCode.count({ where: liveWhere(kind, code) })) > 0;
}

/** Spend a code. True if THIS call spent it. */
export async function claimCiCode(
  kind: CiCodeKind,
  code: string,
  by: { id: string; name: string }
): Promise<boolean> {
  if (!code.trim()) return false;
  const { count } = await db.ciCode.updateMany({
    where: liveWhere(kind, code),
    data: { usedAt: new Date(), usedById: by.id, usedByName: by.name },
  });
  return count === 1;
}

// Give a claimed code back when the thing it was spent on failed — a siege
// that could not be created, an account that could not be inserted.
export async function releaseCiCode(kind: CiCodeKind, code: string): Promise<void> {
  await db.ciCode.updateMany({
    where: { kind, code: normalizeCiCode(code), revokedAt: null },
    data: { usedAt: null, usedById: null, usedByName: "" },
  });
}

// Record who a signup code ended up creating, once the account exists.
export async function attributeCiCode(
  kind: CiCodeKind,
  code: string,
  by: { id: string; name: string }
): Promise<void> {
  await db.ciCode.updateMany({
    where: { kind, code: normalizeCiCode(code) },
    data: { usedById: by.id, usedByName: by.name },
  });
}

export async function revokeCiCode(id: string): Promise<{ kind: string; code: string } | null> {
  const row = await db.ciCode.findFirst({ where: { id, usedAt: null, revokedAt: null } });
  if (!row) return null;
  await db.ciCode.update({ where: { id }, data: { revokedAt: new Date() } });
  return { kind: row.kind, code: row.code };
}

export async function liveCiCodes() {
  return db.ciCode.findMany({
    where: { usedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function recentlyUsedCiCodes(take = 10) {
  return db.ciCode.findMany({
    where: { usedAt: { not: null } },
    orderBy: { usedAt: "desc" },
    take,
  });
}
