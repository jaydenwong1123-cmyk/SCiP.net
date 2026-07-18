import { requireAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";
import {
  setClearanceAction,
  toggleCanPostScpAction,
  toggleAdminAction,
  generateInviteCodeAction,
  revokeInviteCodeAction,
  reviewClearanceRequestAction,
} from "./actions";

export default async function AdminPage() {
  const viewer = await requireAdmin();

  const [members, inviteCodes, pendingRequests] = await Promise.all([
    db.user.findMany({
      where: { isOwner: false },
      orderBy: { displayName: "asc" },
    }),
    db.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { usedBy: { select: { displayName: true } } },
    }),
    db.clearanceRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { displayName: true, clearance: true } } },
    }),
  ]);

  const editableLevels = CLEARANCE_LEVELS.filter((l) => l.rank < 7);

  return (
    <div className="space-y-4">
      <div className="term-panel">
        <h1 className="text-lg tracking-widest">:: OWNER ADMINISTRATION ::</h1>
      </div>

      <div className="term-panel space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">
          PENDING CLEARANCE REQUESTS {pendingRequests.length > 0 && `(${pendingRequests.length})`}
        </h2>
        {pendingRequests.length === 0 && <p className="text-sm">NONE PENDING.</p>}
        {pendingRequests.map((r) => (
          <div key={r.id} className="border-b border-[var(--term-border)]/30 py-2 space-y-1">
            <p className="text-sm">
              {r.user.displayName} ({clearanceLabel(r.user.clearance)}) requests{" "}
              {clearanceLabel(r.requestedLevel)}
            </p>
            <p className="text-sm text-[var(--term-fg-dim)]">{r.reason}</p>
            <div className="flex gap-2">
              <form action={reviewClearanceRequestAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <input type="hidden" name="decision" value="approve" />
                <button className="term-button text-xs">APPROVE</button>
              </form>
              <form action={reviewClearanceRequestAction}>
                <input type="hidden" name="requestId" value={r.id} />
                <input type="hidden" name="decision" value="deny" />
                <button className="term-button text-xs">DENY</button>
              </form>
            </div>
          </div>
        ))}
      </div>

      <div className="term-panel space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">MEMBER MANAGEMENT</h2>
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex flex-wrap items-center gap-3 text-sm border-b border-[var(--term-border)]/30 py-2"
            >
              <span className="min-w-[10rem]">
                {m.displayName ?? "(not yet registered)"}
                {m.isAdmin && <span className="text-[var(--term-amber)]"> [ADMIN]</span>}
              </span>
              <form action={setClearanceAction} className="flex items-center gap-2">
                <input type="hidden" name="userId" value={m.id} />
                <select name="clearance" defaultValue={m.clearance} className="term-input py-1">
                  {editableLevels.map((l) => (
                    <option key={l.rank} value={l.rank}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <button className="term-button text-xs">SET</button>
              </form>
              <form action={toggleCanPostScpAction}>
                <input type="hidden" name="userId" value={m.id} />
                <input type="hidden" name="canPostScp" value={(!m.canPostScp).toString()} />
                <button className="term-button text-xs">
                  {m.canPostScp ? "REVOKE SCP-POST" : "GRANT SCP-POST"}
                </button>
              </form>
              {viewer.isOwner && (
                <form action={toggleAdminAction}>
                  <input type="hidden" name="userId" value={m.id} />
                  <input type="hidden" name="isAdmin" value={(!m.isAdmin).toString()} />
                  <button
                    className="term-button text-xs"
                    style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
                  >
                    {m.isAdmin ? "REVOKE ADMIN" : "GRANT ADMIN"}
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="term-panel space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-[var(--term-fg-dim)]">INVITE CODES</h2>
          <form action={generateInviteCodeAction}>
            <button className="term-button text-xs">+ GENERATE</button>
          </form>
        </div>
        <div className="space-y-1">
          {inviteCodes.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm py-1">
              <span className={c.active ? "" : "text-[var(--term-fg-dim)] line-through"}>
                {c.code}
              </span>
              <span className="text-[var(--term-fg-dim)]">
                {c.usedBy ? `USED BY ${c.usedBy.displayName}` : c.active ? "UNUSED" : "REVOKED"}
              </span>
              {c.active && !c.usedById && (
                <form action={revokeInviteCodeAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="term-button text-xs">REVOKE</button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
