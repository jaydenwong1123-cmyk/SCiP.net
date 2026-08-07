import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  anonymiseRun,
  canAccessCounterIntel,
  canDeleteCounterIntelLog,
  canResolveCounterIntelCase,
  CASE_STATUS_LABELS,
  REVEAL_LABELS,
  REVEAL_MAX,
} from "@/lib/counter-intel";
import { clearanceLabel } from "@/lib/clearance";
import { formatDuration } from "@/lib/hack/config";
import { TraceConsole } from "../trace-console";
import { RevokeForm } from "./revoke-form";
import { DeleteForm } from "./delete-form";
import { CaseStatusForm } from "./case-status-form";
import { StationHead, HudPanel, Readout, Lamp } from "@/components/hud";

export default async function CounterIntelCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!canAccessCounterIntel(user)) notFound();

  const { id } = await params;
  const run = await db.hackRun.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, displayName: true, email: true } },
      traceBy: { select: { id: true, displayName: true, email: true } },
      grant: { select: { id: true, tier: true, expiresAt: true, revokedAt: true } },
      duel: {
        select: {
          winner: true,
          defender: { select: { displayName: true, email: true } },
        },
      },
    },
  });
  if (!run) notFound();

  // Everything below renders from `c` and never from `run`. The raw row holds
  // the intruder's name; only the projection is safe to put in JSX.
  const c = anonymiseRun(run);
  // eslint-disable-next-line react-hooks/purity -- server component; single read of wall-clock for expiry display
  const now = Date.now();
  const grantLive = c.grant && !c.grant.revoked && c.grant.expiresAtMs > now;

  return (
    <>
      <StationHead code="RAISA // CASE FILE" title={c.code}>
        <Readout label="Trace" value={`${c.revealLevel}/${REVEAL_MAX}`} />
        <Readout label="Run Status" value={c.status.toUpperCase()} small />
        <div className="hud-readout">
          <span className="hud-readout__label">Case</span>
          <Lamp
            state={
              c.caseStatus === "RESOLVED"
                ? "off"
                : c.caseStatus === "IN_PROGRESS"
                  ? "warn"
                  : "alert"
            }
          >
            {CASE_STATUS_LABELS[c.caseStatus]}
          </Lamp>
        </div>
        <Link href="/counter-intel" className="term-link text-xs">
          [← ALL SIGNALS]
        </Link>
      </StationHead>

      <HudPanel
        code="01"
        title="CASE WORKFLOW"
        status={c.tracedByName ? `TRACED BY ${c.tracedByName}` : "UNTRACED"}
      >
        <CaseStatusForm
          runId={c.id}
          current={c.caseStatus}
          flagged={c.flagged}
          canResolve={canResolveCounterIntelCase(user)}
        />
        {canDeleteCounterIntelLog(user) && (
          <div className="pt-3">
            <DeleteForm runId={c.id} />
          </div>
        )}
      </HudPanel>

      {c.duel && (
        <HudPanel
          code="02"
          title="COUNTER-INTRUSION RECORD"
          status={`ENGAGED BY ${c.duel.defenderName ?? "UNKNOWN OFFICER"}`}
          variant={c.duel.outcome === "LOST" ? "alert" : undefined}
        >
          <p className="text-sm">
            {c.duel.outcome === "LIVE" ? (
              <span className="text-[var(--term-amber)]">
                DUEL IN PROGRESS — ENGAGED FROM THE DESK
              </span>
            ) : c.duel.outcome === "WON" ? (
              <span className="text-[var(--term-fg-bright)]">
                BREACH CONTAINED — THE OPERATOR WAS REPELLED IN A DIRECT DUEL
              </span>
            ) : (
              <span className="text-[var(--term-red)]">
                CONTAINMENT FAILED — THE OPERATOR WON THE DUEL AND SEIZED ACCESS
              </span>
            )}
          </p>
        </HudPanel>
      )}

      <HudPanel
        code="03"
        title="RECOVERED INTELLIGENCE"
        status={`${c.revealLevel} OF ${REVEAL_MAX} FIELDS UNSEALED`}
      >
        {REVEAL_LABELS.map((label, i) => {
          const unlocked = c.revealLevel > i;
          return (
            <div key={label} className="hud-list">
              <div className="term-row space-y-1 py-2">
                <div className="hud-readout__label flex items-center gap-2">
                  <span aria-hidden>{unlocked ? "▸" : "▪"}</span>
                  {label}
                  <span className="hud-recid ml-auto">
                    {unlocked ? "UNSEALED" : "SEALED"}
                  </span>
                </div>
              {!unlocked ? (
                <div className="redacted text-sm">SEALED PENDING TRACE</div>
              ) : (
                <div className="text-sm space-y-0.5">
                  {i === 0 && (
                    <>
                      <div>FIRST CONTACT: {c.startedAtLabel}</div>
                      <div>LAYERS BREACHED: {c.depthReached}</div>
                      <div>TIER GRANTED: {c.tierLabel ?? "NONE — RUN FAILED"}</div>
                    </>
                  )}
                  {i === 1 && (
                    <>
                      <div>ORIGIN ADDRESS: {c.ip}</div>
                      <div className="break-all">CLIENT: {c.terminal}</div>
                    </>
                  )}
                  {i === 2 && (
                    <>
                      <div>DEPARTMENT: {c.department}</div>
                      <div>CLEARANCE AT BREACH: {c.clearanceLabelAtBreach}</div>
                    </>
                  )}
                  {i === 3 && (
                    <div className="text-[var(--term-red)]">
                      OPERATOR:{" "}
                      {c.userId ? (
                        <Link href={`/personnel/${c.userId}`} className="term-link">
                          {c.displayName}
                        </Link>
                      ) : (
                        c.displayName
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>
          );
        })}
      </HudPanel>

      <HudPanel code="04" title="TRACE CONSOLE">
        <TraceConsole
          runId={c.id}
          revealLevel={c.revealLevel}
          revealMax={REVEAL_MAX}
          lockedNotice={
            c.traceLockedUntilMs && c.traceLockedUntilMs > now
              ? `TRACE BACKOFF ACTIVE — RETRY IN ${formatDuration(
                  c.traceLockedUntilMs - now
                )}.`
              : null
          }
        />
      </HudPanel>

      {c.grant && (
        <HudPanel
          code="05"
          title="ILLICIT ACCESS"
          variant={grantLive ? "alert" : undefined}
          status={grantLive ? "LIVE" : c.grant.revoked ? "REVOKED" : "EXPIRED"}
        >
          <p className="text-sm">
            {clearanceLabel(c.grant.tier)} READ ACCESS —{" "}
            {c.grant.revoked ? (
              <span className="text-[var(--term-fg-dim)]">REVOKED</span>
            ) : grantLive ? (
              <span className="text-[var(--term-red)]">
                LIVE, EXPIRES IN {formatDuration(c.grant.expiresAtMs - now)}
              </span>
            ) : (
              <span className="text-[var(--term-fg-dim)]">EXPIRED</span>
            )}
          </p>
          {grantLive && (
            <div className="pt-2">
              <RevokeForm
                runId={c.id}
                identified={c.revealLevel >= REVEAL_MAX}
              />
            </div>
          )}
        </HudPanel>
      )}
    </>
  );
}
