import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  anonymiseRun,
  canAccessCounterIntel,
  REVEAL_LABELS,
  REVEAL_MAX,
} from "@/lib/counter-intel";
import { clearanceLabel } from "@/lib/clearance";
import { formatDuration } from "@/lib/hack/config";
import { TraceConsole } from "../trace-console";
import { RevokeForm } from "./revoke-form";

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
      grant: { select: { id: true, tier: true, expiresAt: true, revokedAt: true } },
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
    <div className="space-y-4">
      <div className="term-panel space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg tracking-widest">{c.code}</h1>
          <Link href="/counter-intel" className="term-link text-xs">
            [← ALL SIGNALS]
          </Link>
        </div>
        <p className="text-xs text-[var(--term-fg-dim)]">
          TRACE PROGRESS {c.revealLevel}/{REVEAL_MAX} · STATUS {c.status.toUpperCase()}
        </p>
      </div>

      <div className="term-panel space-y-2">
        <h2 className="text-sm tracking-widest text-[var(--term-fg-dim)]">
          RECOVERED INTELLIGENCE
        </h2>

        {REVEAL_LABELS.map((label, i) => {
          const unlocked = c.revealLevel > i;
          return (
            <div
              key={label}
              className="border-b border-[var(--term-border)]/30 py-2 space-y-1"
            >
              <div className="text-xs text-[var(--term-fg-dim)]">
                {unlocked ? "▸" : "▪"} {label}
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
          );
        })}
      </div>

      <div className="term-panel space-y-3">
        <h2 className="text-sm tracking-widest text-[var(--term-fg-dim)]">
          TRACE CONSOLE
        </h2>
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
      </div>

      {c.grant && (
        <div className="term-panel space-y-2">
          <h2 className="text-sm tracking-widest text-[var(--term-fg-dim)]">
            ILLICIT ACCESS
          </h2>
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
            <RevokeForm
              runId={c.id}
              identified={c.revealLevel >= REVEAL_MAX}
            />
          )}
        </div>
      )}
    </div>
  );
}
