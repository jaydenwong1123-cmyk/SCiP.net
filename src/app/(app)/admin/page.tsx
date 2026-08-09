import { Fragment } from "react";
import Link from "next/link";
import { requireStaff, hasOwnerPowers } from "@/lib/session";
import { MAX_CO_OWNERS } from "@/lib/roles";
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
import { MemberList } from "./member-list";
import {
  StationHead,
  HudPanel,
  Readout,
  TickRule,
  EmptyState,
} from "@/components/hud";
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
  // Helper ranks below Staff, but only Admin and above may appoint one.
  const canManageHelper = ownerPowers || viewer.isAdmin;
  // Appointing a Co-Owner is reserved for the seeded owner.
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
    <>
      <StationHead code="ADM // RAISA CONTROL" title="ADMINISTRATION">
        <Link href="/admin/audit" className="term-link text-sm">
          [ACCESS &amp; ACTION LOG]
        </Link>
        {/* The only affordance pointing at OMEGA AUTHORITY anywhere in the UI,
            and it renders for the seeded owner alone — a co-owner passes
            hasOwnerPowers but not this. The route enforces the same check
            itself; this is signposting, not the boundary. */}
        {viewer.isOwner && (
          <Link
            href="/admin/omega"
            className="term-link text-sm"
            style={{ color: "var(--term-red)" }}
          >
            [OMEGA]
          </Link>
        )}
      </StationHead>

      <HudPanel code="01" title="SITE OVERVIEW" status="FACILITY TELEMETRY">
        <div className="hud-readout-bank">
          {stats.map((s) => (
            <Readout key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
        <TickRule className="my-3" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--term-fg-dim)]">
          <span className="hud-readout__label">CLEARANCE DISTRIBUTION</span>
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
      </HudPanel>

      {ownerPowers && (
        <HudPanel
          code="02"
          title={`${viewer.isOwner ? "OWNER" : "CO-OWNER"} SELF-MANAGEMENT`}
        >
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
              <button className="term-button term-button--sm">
                SET OWN CLEARANCE
              </button>
            </form>
          </div>
        </HudPanel>
      )}

      {ownerPowers && siteConfig && (
        <HudPanel
          code="03"
          title={
            <span className="text-[var(--term-amber)]">
              SITE CONTROL — MAINTENANCE LOCKDOWN
            </span>
          }
          status={siteConfig.maintenanceMode ? "LOCKDOWN ACTIVE" : "OPEN"}
          variant={siteConfig.maintenanceMode ? "alert" : "secure"}
        >
          <p className="text-xs text-[var(--term-fg-dim)]">
            When enabled, the site shows a maintenance notice and only visitors
            with the access code can enter. A code is required to enable it. Set
            an auto-unlock time to show the public a live countdown that lifts
            the lockdown on its own when it expires.
            {siteConfig.maintenanceMode && (
              <span className="text-[var(--term-amber)]">
                {" "}CURRENTLY: LOCKED DOWN
                {siteConfig.lockdownUntil
                  ? ` UNTIL ${siteConfig.lockdownUntil.toISOString()}`
                  : ""}
                .
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
            <div>
              <label className="block text-xs text-[var(--term-fg-dim)] mb-1" htmlFor="durationAmount">
                AUTO-UNLOCK AFTER (OPTIONAL — BLANK = UNTIL TURNED OFF)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="durationAmount"
                  name="durationAmount"
                  type="number"
                  min={1}
                  placeholder="e.g. 2"
                  className="term-input py-1 w-24"
                />
                <select name="durationUnit" defaultValue="hours" className="term-input py-1">
                  <option value="minutes">MINUTES</option>
                  <option value="hours">HOURS</option>
                  <option value="days">DAYS</option>
                </select>
              </div>
              <p className="text-[10px] text-[var(--term-fg-dim)] mt-1">
                Counts from when you save. A public countdown is shown to
                visitors and the site unlocks itself when it reaches zero. Blank
                means no timer — the lockdown holds until you turn it off, and
                re-saving without a duration clears any existing countdown.
                {siteConfig.lockdownUntil && (
                  <span className="text-[var(--term-amber)]">
                    {" "}CURRENTLY UNLOCKING AT {siteConfig.lockdownUntil.toISOString()}.
                  </span>
                )}
              </p>
            </div>
            <button
              className="term-button term-button--sm"
              style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
            >
              SAVE SITE CONTROL
            </button>
          </form>
        </HudPanel>
      )}

      <HudPanel
        code="04"
        title="PENDING CLEARANCE REQUESTS"
        status={`${pendingRequests.length} AWAITING REVIEW`}
      >
        <div className="hud-list">
        {pendingRequests.length === 0 && (
          <EmptyState glyph="○" title="None pending" />
        )}
        {pendingRequests.map((r) => (
          <form
            key={r.id}
            action={reviewClearanceRequestAction}
            className="term-row space-y-2"
          >
            <p className="text-sm flex flex-wrap items-center gap-2">
              <span className="text-[var(--term-fg-bright)]">
                {r.user.displayName}
              </span>
              <span className="clearance-chip text-[10px]">
                {clearanceDisplay(r.user.clearance, r.user.designation)}
              </span>
              <span className="hud-recid">REQUESTS</span>
              <span className="clearance-chip text-[10px]">
                {clearanceLabel(r.requestedLevel)}
              </span>
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
                className="term-button term-button--sm"
              >
                APPROVE
              </button>
              <button
                name="decision"
                value="deny"
                className="term-button term-button--danger term-button--sm"
              >
                DENY
              </button>
            </div>
          </form>
        ))}
        </div>
      </HudPanel>

      <HudPanel
        code="05"
        title="MEMBER MANAGEMENT"
        status={`${members.length} ON ROSTER`}
      >
        <p className="hud-readout__label mb-2">
          CLICK A MEMBER TO OPEN ACTIONS, OR TICK SEVERAL TO ACT ON THEM AT ONCE.
        </p>
        <MemberList
          members={members.map((m) => ({
            id: m.id,
            displayName: m.displayName,
            clearance: m.clearance,
            designation: m.designation,
            canPostScp: m.canPostScp,
            canFileIncident: m.canFileIncident,
            canLogTest: m.canLogTest,
            canEditPersonnel: m.canEditPersonnel,
            isCoOwner: m.isCoOwner,
            isAdmin: m.isAdmin,
            isStaff: m.isStaff,
            isHelper: m.isHelper,
            department: m.department,
            suspended: m.suspended,
          }))}
          canGrantTopClearance={canGrantTopClearance}
          canManageStaff={canManageStaff}
          canManageAdmin={canManageAdmin}
          canManageCoOwner={canManageCoOwner}
          // `members` excludes the owner but lists every co-owner, so the
          // seated count comes free with the rows already fetched.
          coOwnerSeatsLeft={Math.max(
            0,
            MAX_CO_OWNERS - members.filter((m) => m.isCoOwner).length
          )}
          canManageHelper={canManageHelper}
          hasAdminPowers={ownerPowers || viewer.isAdmin}
        />
      </HudPanel>

      <HudPanel
        code="06"
        title="INVITE CODES"
        status={`${inviteCodes.length} ISSUED`}
      >
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
          <button className="term-button term-button--sm">+ GENERATE</button>
        </form>

        <TickRule className="my-3" />

        <div className="hud-list">
          {inviteCodes.length === 0 && (
            <EmptyState glyph="⚿" title="No invite codes generated" />
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
                className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-between text-sm term-row"
              >
                <span className="flex flex-col">
                  <span
                    className={
                      dead
                        ? "hud-recid line-through"
                        : "hud-recid text-[var(--term-fg-bright)]"
                    }
                  >
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
                <span className={`hud-lamp hud-lamp--${dead ? "off" : "on"}`}>
                  {status}
                </span>
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
                    <button className="term-button term-button--danger term-button--sm">
                      REVOKE
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </HudPanel>
    </>
  );
}
