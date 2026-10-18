import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Both lists only reference `db` inside closures, so a stub is enough to load
// them without a database.
vi.mock("@/lib/db", () => ({ db: {} }));

import { BACKUP_TABLES } from "@/lib/backup";
import { PURGED_TABLES } from "@/lib/purge-site";

// The backup and the OMEGA purge each list every model by hand. This is what
// makes a forgotten model fail loudly instead of silently going un-backed-up
// or surviving a purge with dangling references.

const schema = readFileSync(
  fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url)),
  "utf8"
);
const MODELS = [...schema.matchAll(/^model (\w+) \{/gm)].map(
  ([, name]) => name![0]!.toLowerCase() + name!.slice(1)
);

// Deliberately left out of the backup.
const NOT_BACKED_UP: Record<string, string> = {
  authAttempt: "throttling ledger; stale after an hour",
};

// Deliberately left standing by purgeSite.
const NOT_PURGED: Record<string, string> = {
  user: "deleted separately, sparing the owner",
  siteConfig: "holds the shutdown state itself",
  engineGuildConfig: "Discord bot data",
  engineMember: "Discord bot data",
  enginePointEntry: "Discord bot data",
  engineRank: "Discord bot data",
  enginePromotionRequest: "Discord bot data",
  councilGuildConfig: "Discord bot data",
  councilDivisionConfig: "Discord bot data",
  councilRank: "Discord bot data",
  councilMember: "Discord bot data",
  councilStanding: "Discord bot data",
  councilPointEntry: "Discord bot data",
  councilPromotionRequest: "Discord bot data",
  councilShift: "Discord bot data",
  botAction: "Discord bot data",
};

describe("backup and purge cover every model", () => {
  it("found the models", () => {
    expect(MODELS.length).toBeGreaterThan(40);
  });

  it("backs up every model", () => {
    // Attachment is dumped by hand after the table loop, for its Bytes column.
    const covered = new Set<string>([...BACKUP_TABLES, "attachment"]);
    const missing = MODELS.filter((m) => !covered.has(m) && !(m in NOT_BACKED_UP));
    expect(missing).toEqual([]);
  });

  it("purges every model", () => {
    const covered = new Set<string>(PURGED_TABLES);
    const missing = MODELS.filter((m) => !covered.has(m) && !(m in NOT_PURGED));
    expect(missing).toEqual([]);
  });

  it("names no model that does not exist", () => {
    const known = new Set(MODELS);
    const stale = [
      ...BACKUP_TABLES,
      ...PURGED_TABLES,
      ...Object.keys(NOT_BACKED_UP),
      ...Object.keys(NOT_PURGED),
    ].filter((m) => !known.has(m));
    expect(stale).toEqual([]);
  });
});
