import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { canPostBroadcast } from "@/lib/clearance";
import { renderRedacted } from "@/lib/redact";
import { BroadcastForm } from "./broadcast-form";
import { deleteBroadcastAction } from "./actions";

export default async function BroadcastsPage() {
  const user = await requireUser();
  const canManage = user.isOwner || user.isAdmin;
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
        {broadcasts.length === 0 && <p className="text-sm term-panel">NO BROADCASTS YET.</p>}
        {broadcasts.map((b) => (
          <div key={b.id} className="term-panel space-y-1">
            <div className="flex justify-between text-sm text-[var(--term-fg-dim)]">
              <span>{b.author.displayName}</span>
              <span>{b.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
            </div>
            <p className="font-bold">{b.title}</p>
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {renderRedacted(b.body, user.clearance)}
            </pre>
            {canManage && (
              <form action={deleteBroadcastAction} className="pt-2">
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
        ))}
      </div>
    </div>
  );
}
