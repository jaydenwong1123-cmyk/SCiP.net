import { db } from "@/lib/db";

// Revision history shared by the three editable document types. Each stores
// title + body plus a small bag of type-specific metadata, which is kept as
// JSON rather than three parallel tables.

export const REVISION_ENTITIES = {
  scp: "scp",
  incident: "incident",
  broadcast: "broadcast",
} as const;

export type RevisionEntity =
  (typeof REVISION_ENTITIES)[keyof typeof REVISION_ENTITIES];

// Metadata captured alongside title/body, by entity type.
export type RevisionMeta = {
  classification?: string;
  severity?: string;
  location?: string;
  clearanceRequired?: number;
};

export function encodeMeta(meta: RevisionMeta): string {
  return JSON.stringify(meta);
}

export function decodeMeta(raw: string): RevisionMeta {
  try {
    const parsed = JSON.parse(raw || "{}");
    return typeof parsed === "object" && parsed !== null
      ? (parsed as RevisionMeta)
      : {};
  } catch {
    return {};
  }
}

// Snapshot the pre-edit state. Call this *before* applying an update, passing
// the values the document currently holds.
export async function snapshotRevision(args: {
  entityType: RevisionEntity;
  entityId: string;
  title: string;
  body: string;
  meta: RevisionMeta;
  reason: string;
  editor: { id: string; displayName: string | null; email: string };
}): Promise<void> {
  await db.revision.create({
    data: {
      entityType: args.entityType,
      entityId: args.entityId,
      title: args.title,
      body: args.body,
      meta: encodeMeta(args.meta),
      reason: args.reason.slice(0, 300),
      editorId: args.editor.id,
      editorName: args.editor.displayName ?? args.editor.email,
    },
  });
}

export async function listRevisions(
  entityType: RevisionEntity,
  entityId: string
) {
  return db.revision.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
  });
}

// Revisions are deleted with their parent document — nothing else references
// them, and an orphaned history is just noise in the table.
export async function deleteRevisionsFor(
  entityType: RevisionEntity,
  entityId: string
): Promise<void> {
  await db.revision.deleteMany({ where: { entityType, entityId } });
}

// A cheap line-level diff for the history view: which lines were added and
// removed between two versions. Not a real LCS diff — for prose documents a
// presence-based comparison reads well enough and stays fast.
export function summarizeChange(before: string, after: string): {
  added: number;
  removed: number;
} {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const beforeSet = new Map<string, number>();
  for (const line of beforeLines) {
    beforeSet.set(line, (beforeSet.get(line) ?? 0) + 1);
  }
  let added = 0;
  for (const line of afterLines) {
    const count = beforeSet.get(line) ?? 0;
    if (count > 0) beforeSet.set(line, count - 1);
    else added += 1;
  }
  let removed = 0;
  for (const count of beforeSet.values()) removed += count;
  return { added, removed };
}
