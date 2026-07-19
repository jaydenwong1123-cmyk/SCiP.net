import Link from "next/link";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { canPostBroadcast } from "@/lib/clearance";
import { canEditBroadcast } from "@/lib/doc-permissions";
import { renderRedacted, canBypassRedaction } from "@/lib/redact";
import { BroadcastForm } from "./broadcast-form";
import { deleteBroadcastAction } from "./actions";

export default async function BroadcastsPage() {
  const user = await requireUser();
  const canManage = hasAdminPowers(user);
  const broadcasts = await db.broadcast.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="term-panel">
        <h1 className="text-lg tracking-widest">:: FOUNDATION BROADCASTS ::</h1>
      </div>

      {canPostBroadcast(user.clearance) && (
        <div className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-fg-dim)]">POST NEW ANNOUNCEMENT</h2>
          <BroadcastForm />
        </div>
      )}

      <div className="space-y-3">
        {broadcasts.length === 0 && (
          <div className="term-panel">
            <div className="empty-state">
              <span className="empty-state__glyph" aria-hidden>
                ✇
              </span>
              <p className="empty-state__title">NO BROADCASTS YET</p>
              <p className="text-sm">
                SITE-WIDE DIRECTIVES WILL APPEAR HERE ONCE ISSUED.
              </p>
            </div>
          </div>
        )}
        {broadcasts.map((b) => (
          <div key={b.id} className="term-panel space-y-1">
            <div className="flex flex-wrap justify-between gap-x-3 text-sm text-[var(--term-fg-dim)]">
              <span>{b.author.displayName}</span>
              <span>
                {b.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                {b.updatedAt && ` — AMENDED (REV ${b.revisionCount})`}
              </span>
            </div>
            <p className="font-bold">{b.title}</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">
              {renderRedacted(b.body, user.clearance, canBypassRedaction(user))}
            </pre>
            <div className="flex flex-wrap items-center gap-3 pt-2 text-sm">
              {canEditBroadcast(user, b) && (
                <Link href={`/broadcasts/${b.id}/edit`} className="term-link">
                  [AMEND]
                </Link>
              )}
              {b.revisionCount > 0 && (
                <Link href={`/broadcasts/${b.id}/history`} className="term-link">
                  [HISTORY ({b.revisionCount})]
                </Link>
              )}
              {canManage && (
                <form action={deleteBroadcastAction}>
                  <input type="hidden" name="id" value={b.id} />
                  <button
                    className="term-button text-xs"
                    style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
                  >
                    [DELETE BROADCAST]
                  </button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
