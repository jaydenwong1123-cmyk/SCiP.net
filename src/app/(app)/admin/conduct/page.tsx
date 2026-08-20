import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, hasAdminPowers } from "@/lib/session";
import { caseCode } from "@/lib/counter-intel";
import { SUSPICION_FLAG_SCORE } from "@/lib/hack/config";
import { CONDUCT_SURFACE_LABELS } from "@/lib/hack/conduct";
import {
  StationHead,
  HudPanel,
  Readout,
  TickRule,
  EmptyState,
} from "@/components/hud";

// The conduct log: every graded puzzle round, and what its timing looked like.
//
// ADMIN+ ONLY, and the gate is the whole reason this page can exist at all.
// Rows here are keyed to a named member — including intruders whose identity
// the counter-intel reveal ladder is specifically designed to keep from RAISA
// until they have traced it. hasAdminPowers() is the tier that already deletes
// accounts and grants L-OMNI, so it learns nothing here it could not already
// learn; an ordinary RAISA officer cannot reach this page, and what they see
// instead is HackRun.flagged, which carries a marker and no name.
//
// Nothing on this page is an accusation. A score is an invitation to look.

const PAGE_SIZE = 50;

// Rounds below this are ordinary play and would bury the signal. The page
// defaults to showing only what scored something.
const DEFAULT_MIN_SCORE = 1;

export default async function ConductLogPage({
  searchParams,
}: {
  searchParams: Promise<{ surface?: string; all?: string; page?: string }>;
}) {
  const user = await requireUser();
  if (!hasAdminPowers(user)) notFound();

  const { surface, all, page: pageParam } = await searchParams;
  const pageNum = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const showAll = all === "1";
  const activeSurface =
    surface && surface in CONDUCT_SURFACE_LABELS ? surface : null;

  const where: Prisma.ConductRecordWhereInput = {
    ...(activeSurface ? { surface: activeSurface } : {}),
    ...(showAll ? {} : { score: { gte: DEFAULT_MIN_SCORE } }),
  };

  const [records, total, marked] = await Promise.all([
    db.conductRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { id: true, displayName: true, email: true } },
      },
    }),
    db.conductRecord.count({ where }),
    db.conductRecord.count({ where: { score: { gte: SUSPICION_FLAG_SCORE } } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (next: {
    surface?: string | null;
    all?: boolean;
    page?: number;
  }) => {
    const params = new URLSearchParams();
    const s = next.surface === undefined ? activeSurface : next.surface;
    const a = next.all === undefined ? showAll : next.all;
    if (s) params.set("surface", s);
    if (a) params.set("all", "1");
    if (next.page && next.page > 1) params.set("page", String(next.page));
    const query = params.toString();
    return query ? `/admin/conduct?${query}` : "/admin/conduct";
  };

  const seg = (active: boolean) => `hud-seg${active ? " hud-seg--on" : ""}`;

  return (
    <>
      <StationHead code="ADM // CONDUCT" title="PUZZLE CONDUCT LOG">
        <Readout label="Records" value={total} />
        <Readout label="At Threshold" value={marked} small />
        <Link href="/admin" className="term-link text-sm">
          [BACK TO ADMIN]
        </Link>
      </StationHead>

      <HudPanel code="01" title="HOW TO READ THIS" status="ADVISORY">
        <p className="text-sm leading-snug">
          Every graded round on the intrusion ladder, the trace ladder and both
          duel seats is timed against a per-game floor — the fastest a person
          could plausibly read the puzzle and answer it. That measurement is
          taken between two server timestamps and cannot be faked by the
          browser.
        </p>
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug mt-2">
          The lighter signals — keystroke counts, refused pastes, time spent on
          another window — are reported BY the browser and can be forged by
          anyone willing to write a script. They are weighted so that no
          combination of them alone reaches the {SUSPICION_FLAG_SCORE}-point
          review threshold. Nothing here has ever failed a round or revoked a
          grant; a score is a reason for a person to look, not a verdict.
        </p>
      </HudPanel>

      <HudPanel code="02" title="QUERY" status="LOG FILTER">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="hud-readout__label w-16">SURFACE</span>
          <div className="hud-segmented">
            <Link
              href={qs({ surface: null, page: 1 })}
              className={seg(!activeSurface)}
            >
              ALL
            </Link>
            {Object.entries(CONDUCT_SURFACE_LABELS).map(([key, label]) => (
              <Link
                key={key}
                href={qs({ surface: key, page: 1 })}
                className={seg(activeSurface === key)}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hud-readout__label w-16">SCOPE</span>
          <div className="hud-segmented">
            <Link href={qs({ all: false, page: 1 })} className={seg(!showAll)}>
              SCORED ONLY
            </Link>
            <Link href={qs({ all: true, page: 1 })} className={seg(showAll)}>
              EVERY ROUND
            </Link>
          </div>
        </div>
      </HudPanel>

      <HudPanel
        code="03"
        title="GRADED ROUNDS"
        status={`PAGE ${pageNum} / ${totalPages}`}
        variant={marked > 0 ? "alert" : undefined}
      >
        <div className="hud-list">
          {records.length === 0 && (
            <EmptyState glyph="▦" title="Nothing to review">
              <p className="text-xs">
                {showAll
                  ? "NO ROUNDS HAVE BEEN GRADED YET."
                  : "NO ROUND HAS SCORED AGAINST THE CONDUCT HEURISTICS."}
              </p>
            </EmptyState>
          )}
          {records.map((r) => {
            const reasons: string[] = (() => {
              try {
                const parsed: unknown = JSON.parse(r.reasons || "[]");
                return Array.isArray(parsed) ? parsed.map(String) : [];
              } catch {
                return [];
              }
            })();
            const atThreshold = r.score >= SUSPICION_FLAG_SCORE;
            return (
              <div key={r.id} className="term-row text-sm space-y-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 break-words">
                    <span className="hud-recid mr-2">
                      {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                    <Link
                      href={`/personnel/${r.user.id}`}
                      className="term-link text-[var(--term-fg-bright)]"
                    >
                      {r.user.displayName || r.user.email}
                    </Link>{" "}
                    <span className="text-[var(--term-fg-dim)]">
                      {CONDUCT_SURFACE_LABELS[r.surface] ?? r.surface} ·{" "}
                      {r.game.toUpperCase()} ·{" "}
                      {(r.elapsedMs / 1000).toFixed(1)}S ·{" "}
                      {r.correct ? "CORRECT" : "WRONG"}
                    </span>
                  </span>
                  <span
                    className={`hud-recid shrink-0 ${
                      atThreshold ? "text-[var(--term-red)]" : ""
                    }`}
                  >
                    SCORE {r.score}
                    {atThreshold ? " — AT THRESHOLD" : ""}
                  </span>
                </div>
                {reasons.length > 0 && (
                  <ul className="text-xs text-[var(--term-amber)] space-y-0.5">
                    {reasons.map((reason, i) => (
                      <li key={i}>
                        <span className="text-[var(--term-fg-dim)]">{">"}</span>{" "}
                        {reason}
                      </li>
                    ))}
                  </ul>
                )}
                {r.runId && (
                  <Link
                    href={`/counter-intel/${r.runId}`}
                    className="term-link text-xs"
                  >
                    [CASE {caseCode(r.runId)}]
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <>
            <TickRule className="mt-3" />
            <div className="flex items-center justify-between text-sm pt-2">
              {pageNum > 1 ? (
                <Link href={qs({ page: pageNum - 1 })} className="term-link">
                  [← NEWER]
                </Link>
              ) : (
                <span className="text-[var(--term-fg-dim)]">[← NEWER]</span>
              )}
              <span className="hud-recid">
                PAGE {pageNum} / {totalPages} — {total} RECORDS
              </span>
              {pageNum < totalPages ? (
                <Link href={qs({ page: pageNum + 1 })} className="term-link">
                  [OLDER →]
                </Link>
              ) : (
                <span className="text-[var(--term-fg-dim)]">[OLDER →]</span>
              )}
            </div>
          </>
        )}
      </HudPanel>
    </>
  );
}
