import { db } from "@/lib/db";

// Member correspondence is not kept forever. Messages older than the window
// below are deleted outright — this is a real delete, not a query-time filter
// like the oversight log in `message-logs.ts`, because the members' own copies
// are the rows being removed.
//
// This deployment has no cron, so the sweep runs opportunistically off normal
// traffic (same approach as `pruneExpiredAttachments`): every message read has
// a small chance of triggering it, which is frequent enough to keep the table
// bounded and cheap enough to be invisible.
export const MESSAGE_RETENTION_DAYS = 21;

export function messageRetentionCutoff(now = new Date()): Date {
  return new Date(
    now.getTime() - MESSAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
}

export async function pruneExpiredMessages(probability = 0.05): Promise<void> {
  if (Math.random() > probability) return;
  try {
    await db.message.deleteMany({
      where: { createdAt: { lt: messageRetentionCutoff() } },
    });
  } catch {
    /* best-effort */
  }
}
