import { requireStaff } from "@/lib/session";
import { db } from "@/lib/db";
import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";
import { MemberRow } from "./member-row";
import {
  generateInviteCodeAction,
  revokeInviteCodeAction,
  reviewClearanceRequestAction,
} from "./actions";

export default async function AdminPage() {
  const viewer = await requireStaff();
  const canManageStaff = viewer.isOwner || viewer.isAdmin;
  const canManageAdmin = viewer.isOwner;
  const canGrantTopClearance = viewer.isOwner || viewer.isAdmin;

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

  const editableLevels = CLEARANCE_LEVELS.map((l) => ({
    rank: l.rank,
    label: l.label,
  }));

  return (
    <div className="space-y-4">
      <div className="term-panel">
        <h1 className="text-lg tracking-widest">:: ADMINISTRATION ::</h1>
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

      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">MEMBER MANAGEMENT</h2>
        <p className="text-xs text-[var(--term-fg-dim)]">
          CLICK A MEMBER TO OPEN ACTIONS.
        </p>
        <div>
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={{
                id: m.id,
                displayName: m.displayName,
                clearance: m.clearance,
                canPostScp: m.canPostScp,
                isAdmin: m.isAdmin,
                isStaff: m.isStaff,
              }}
              levels={editableLevels}
              canGrantTopClearance={canGrantTopClearance}
              canManageStaff={canManageStaff}
              canManageAdmin={canManageAdmin}
            />
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
