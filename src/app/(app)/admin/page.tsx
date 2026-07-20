import { Fragment } from "react";
import Link from "next/link";
import { requireStaff, hasOwnerPowers } from "@/lib/session";
import { db } from "@/lib/db";
import {
  CLEARANCE_LEVELS,
  CLEARANCE_ASSIGN_OPTIONS,
  E5_DESIGNATION,
  R5_DESIGNATION,
  clearanceLabel,
  clearanceDisplay,
  clearanceAssignValue,
} from "@/lib/clearance";
import { getSiteConfig } from "@/lib/site-config";
import { MemberRow } from "./member-row";
import {
  generateInviteCodeAction,
  revokeInviteCodeAction,
  reviewClearanceRequestAction,
  setOwnDisplayNameAction,
  setOwnClearanceAction,
  setMaintenanceAction,
} from "./actions";

export default async function AdminPage() {
  const viewer = await requireStaff();
  const ownerPowers = hasOwnerPowers(viewer);
  const canManageStaff = ownerPowers || viewer.isAdmin;
  const canManageAdmin = ownerPowers;
  // Appointing the single Co-Owner is reserved for the seeded owner.
  const canManageCoOwner = viewer.isOwner;
  const canGrantTopClearance = ownerPowers || viewer.isAdmin;

  const [
    members,
    inviteCodes,
    pendingRequests,
    tierCounts,
    suspendedCount,
    staffCount,
    scpCount,
    incidentCount,
    messageCount,
    activeInviteCount,
    e5Count,
    r5Count,
  ] = await Promise.all([
    db.user.findMany({
      where: { isOwner: false },
      orderBy: { displayName: "asc" },
    }),
    db.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        usedBy: { select: { displayName: true } },
        createdBy: { select: { displayName: true } },
        redemptions: {
          select: { user: { select: { displayName: true, email: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.clearanceRequest.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      include: {
        user: { select: { displayName: true, clearance: true, designation: true } },
      },
    }),
    db.user.groupBy({ by: ["clearance"], _count: true }),
    db.user.count({ where: { suspended: true } }),
    db.user.count({ where: { OR: [{ isStaff: true }, { isAdmin: true }] } }),
    db.scpFile.count(),
    db.incidentReport.count(),
    db.message.count(),
    // "Active" now means uses remain, not merely that nobody has redeemed it —
    // a multi-use code stays available until exhausted.
    db.inviteCode.count({
      where: {
        active: true,
        useCount: { lt: db.inviteCode.fields.maxUses },
      },
    }),
    db.user.count({ where: { designation: E5_DESIGNATION } }),
    db.user.count({ where: { designation: R5_DESIGNATION } }),
  ]);

  // eslint-disable-next-line react-hooks/purity -- server component; single read of wall-clock for expiry display
  const now = Date.now();
  const totalMembers = tierCounts.reduce((sum, t) => sum + t._count, 0);
  const tierMap = new Map(tierCounts.map((t) => [t.clearance, t._count]));

  const stats = [
    { label: "MEMBERS", value: totalMembers },
    { label: "STAFF/ADMIN", value: staffCount },
    { label: "SUSPENDED", value: suspendedCount },
    { label: "PENDING REQ", value: pendingRequests.length },
    { label: "ACTIVE INVITES", value: activeInviteCount },
    { label: "SCP FILES", value: scpCount },
    { label: "INCIDENTS", value: incidentCount },
    { label: "MESSAGES", value: messageCount },
  ];

  const siteConfig = ownerPowers ? await getSiteConfig() : null;

  return (
    <div className="space-y-4">
      <div className="term-panel flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: ADMINISTRATION ::</h1>
        <Link href="/admin/audit" className="term-link text-sm">
          [ACCESS &amp; ACTION LOG]
        </Link>
      </div>

      <div className="term-panel space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">SITE OVERVIEW</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <div
              key={s.label}
              className="border border-[var(--term-border)]/40 p-2 text-center"
            >
              <div className="text-2xl text-[var(--term-fg-bright)]">{s.value}</div>
              <div className="text-[10px] text-[var(--term-fg-dim)] tracking-wider">
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--term-fg-dim)]">
          <span>CLEARANCE DISTRIBUTION:</span>
          {CLEARANCE_LEVELS.map((l) => (
            <Fragment key={l.rank}>
              <span>
                {l.label}=
                <span className="text-[var(--term-fg)]">
                  {tierMap.get(l.rank) ?? 0}
                </span>
              </span>
              {l.rank === 5 && (
                <>
                  <span>
                    L-E5=<span className="text-[var(--term-fg)]">{e5Count}</span>
                  </span>
                  <span>
                    L-R5=<span className="text-[var(--term-fg)]">{r5Count}</span>
                  </span>
                </>
              )}
            </Fragment>
          ))}
        </div>
      </div>

      {ownerPowers && (
        <div className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-fg-dim)]">
            {viewer.isOwner ? "OWNER" : "CO-OWNER"} SELF-MANAGEMENT
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <form action={setOwnDisplayNameAction} className="flex items-center gap-2">
              <input
                type="text"
                name="displayName"
                defaultValue={viewer.displayName ?? ""}
                placeholder="YOUR DISPLAY NAME"
                maxLength={60}
                className="term-input py-1 w-48"
              />
              <button className="term-button text-xs">RENAME SELF</button>
            </form>
            <form action={setOwnClearanceAction} className="flex items-center gap-2">
              <select
                name="clearance"
                defaultValue={clearanceAssignValue(viewer.clearance, viewer.designation)}
                className="term-input py-1"
              >
                {CLEARANCE_ASSIGN_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button className="term-button text-xs">SET OWN CLEARANCE</button>
            </form>
          </div>
        </div>
      )}

      {ownerPowers && siteConfig && (
        <div className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-amber)]">
            SITE CONTROL — MAINTENANCE LOCKDOWN
          </h2>
          <p className="text-xs text-[var(--term-fg-dim)]">
            When enabled, the site shows a maintenance notice and only visitors
            with the access code can enter. A code is required to enable it.
            {siteConfig.maintenanceMode && (
              <span className="text-[var(--term-amber)]">
                {" "}CURRENTLY: LOCKED DOWN.
              </span>
            )}
          </p>
          <form action={setMaintenanceAction} className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="maintenanceMode"
                defaultChecked={siteConfig.maintenanceMode}
              />
              <span>ENABLE MAINTENANCE MODE</span>
            </label>
            <div>
              <label className="block text-xs text-[var(--term-fg-dim)] mb-1" htmlFor="bypassCode">
                ACCESS CODE (required to enable)
              </label>
              <input
                id="bypassCode"
                name="bypassCode"
                defaultValue={siteConfig.bypassCode}
                maxLength={64}
                placeholder="e.g. OMEGA-7"
                className="term-input py-1 w-64"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--term-fg-dim)] mb-1" htmlFor="maintenanceMessage">
                NOTICE MESSAGE (shown to visitors)
              </label>
              <input
                id="maintenanceMessage"
                name="maintenanceMessage"
                defaultValue={siteConfig.maintenanceMessage}
                maxLength={300}
                placeholder="THE NETWORK IS OFFLINE FOR A SCHEDULED UPDATE."
                className="term-input py-1 w-full"
              />
            </div>
            <button
              className="term-button text-xs"
              style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
            >
              SAVE SITE CONTROL
            </button>
          </form>
        </div>
      )}

      <div className="term-panel space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">
          PENDING CLEARANCE REQUESTS {pendingRequests.length > 0 && `(${pendingRequests.length})`}
        </h2>
        {pendingRequests.length === 0 && <p className="text-sm">NONE PENDING.</p>}
        {pendingRequests.map((r) => (
          <form
            key={r.id}
            action={reviewClearanceRequestAction}
            className="border-b border-[var(--term-border)]/30 py-2 space-y-2"
          >
            <p className="text-sm">
              {r.user.displayName} (
              {clearanceDisplay(r.user.clearance, r.user.designation)}) requests{" "}
              {clearanceLabel(r.requestedLevel)}
            </p>
            <p className="text-sm text-[var(--term-fg-dim)]">{r.reason}</p>
            <input type="hidden" name="requestId" value={r.id} />
            <input
              type="text"
              name="reviewNote"
              placeholder="REVIEWER NOTE (OPTIONAL, SHOWN TO MEMBER)"
              maxLength={500}
              className="term-input py-1 text-sm"
            />
            <div className="flex gap-2">
              <button
                name="decision"
                value="approve"
                className="term-button text-xs"
              >
                APPROVE
              </button>
              <button
                name="decision"
                value="deny"
                className="term-button text-xs"
                style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
              >
                DENY
              </button>
            </div>
          </form>
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
                designation: m.designation,
                canPostScp: m.canPostScp,
                canFileIncident: m.canFileIncident,
                isCoOwner: m.isCoOwner,
                isAdmin: m.isAdmin,
                isStaff: m.isStaff,
                department: m.department,
                suspended: m.suspended,
              }}
              canGrantTopClearance={canGrantTopClearance}
              canManageStaff={canManageStaff}
              canManageAdmin={canManageAdmin}
              canManageCoOwner={canManageCoOwner}
            />
          ))}
        </div>
      </div>

      <div className="term-panel space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">INVITE CODES</h2>
        <form
          action={generateInviteCodeAction}
          className="flex flex-wrap items-end gap-2 text-sm"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--term-fg-dim)]">HOW MANY</span>
            <input
              type="number"
              name="count"
              defaultValue={1}
              min={1}
              max={50}
              className="term-input py-1 w-20"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--term-fg-dim)]">
              USES PER CODE
            </span>
            <input
              type="number"
              name="maxUses"
              defaultValue={1}
              min={1}
              max={100}
              className="term-input py-1 w-24"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--term-fg-dim)]">
              EXPIRES (DAYS, BLANK = NEVER)
            </span>
            <input
              type="number"
              name="expiryDays"
              min={1}
              max={365}
              placeholder="∞"
              className="term-input py-1 w-28"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-[var(--term-fg-dim)]">
              LABEL (OPTIONAL)
            </span>
            <input
              type="text"
              name="note"
              maxLength={120}
              placeholder="e.g. MTF NU-7 INTAKE"
              className="term-input py-1 w-56"
            />
          </label>
          <button className="term-button text-xs">+ GENERATE</button>
        </form>

        <div className="space-y-1">
          {inviteCodes.length === 0 && (
            <p className="text-sm text-[var(--term-fg-dim)]">
              NO INVITE CODES HAVE BEEN GENERATED.
            </p>
          )}
          {inviteCodes.map((c) => {
            const exhausted = c.useCount >= c.maxUses;
            const expired = !!c.expiresAt && c.expiresAt.getTime() < now && !exhausted;
            const dead = exhausted || !c.active || expired;

            // A multi-use code reports remaining uses; a single-use one keeps
            // the original "USED BY <name>" phrasing.
            const status = exhausted
              ? c.maxUses === 1 && c.usedBy
                ? `USED BY ${c.usedBy.displayName}`
                : `EXHAUSTED (${c.useCount}/${c.maxUses})`
              : !c.active
                ? `REVOKED${c.revokedReason ? `: ${c.revokedReason}` : ""}`
                : expired
                  ? "EXPIRED"
                  : c.maxUses > 1
                    ? `${c.maxUses - c.useCount} OF ${c.maxUses} LEFT${
                        c.expiresAt
                          ? ` — EXPIRES ${c.expiresAt.toISOString().slice(0, 10)}`
                          : ""
                      }`
                    : c.expiresAt
                      ? `EXPIRES ${c.expiresAt.toISOString().slice(0, 10)}`
                      : "UNUSED";

            return (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-between text-sm term-row border-b border-[var(--term-border)]/20"
              >
                <span className="flex flex-col">
                  <span className={dead ? "text-[var(--term-fg-dim)] line-through" : ""}>
                    {c.code}
                  </span>
                  {(c.note || c.createdBy) && (
                    <span className="text-[10px] text-[var(--term-fg-dim)]">
                      {c.note}
                      {c.note && c.createdBy ? " — " : ""}
                      {c.createdBy ? `BY ${c.createdBy.displayName}` : ""}
                    </span>
                  )}
                  {c.redemptions.length > 0 && (
                    <span className="text-[10px] text-[var(--term-fg-dim)]">
                      REDEEMED BY:{" "}
                      {c.redemptions
                        .map((r) => r.user.displayName ?? r.user.email)
                        .join(", ")}
                    </span>
                  )}
                </span>
                <span className="text-[var(--term-fg-dim)] text-xs">{status}</span>
                {c.active && !exhausted && !expired && (
                  <form
                    action={revokeInviteCodeAction}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="id" value={c.id} />
                    <input
                      type="text"
                      name="reason"
                      maxLength={200}
                      placeholder="REASON (OPTIONAL)"
                      className="term-input py-0.5 text-xs w-44"
                    />
                    <button className="term-button text-xs">REVOKE</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
