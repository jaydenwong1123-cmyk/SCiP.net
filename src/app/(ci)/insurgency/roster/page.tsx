import Link from "next/link";
import { db } from "@/lib/db";
import { requireInsurgent } from "@/lib/session";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";
import { CI_RANK_LABELS, ciRankOf } from "@/lib/ci/ranks";

// Every Chaos Insurgency operative, for other operatives. Reads only CI rows
// (isInsurgent: true) and selects no Foundation-facing fields.
export default async function RosterPage() {
  const viewer = await requireInsurgent();

  const operatives = await db.user.findMany({
    where: { isInsurgent: true, suspended: false, displayName: { not: null } },
    orderBy: { displayName: "asc" },
    select: { id: true, displayName: true, createdAt: true, personalFile: true, ciRank: true },
  });

  return (
    <>
      <StationHead code="CI-02 // OPERATIVE REGISTRY" title="OPERATIVE ROSTER">
        <Readout label="On Record" value={operatives.length} />
      </StationHead>

      <HudPanel code="01" title="REGISTRY" status={`${operatives.length} OPERATIVES`}>
        <div className="hud-list">
          {operatives.length === 0 && <EmptyState glyph="◈" title="No operatives on record" />}
          {operatives.map((o) => (
            <Link
              key={o.id}
              href={`/insurgency/roster/${o.id}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="hud-recid">CI-{String(o.id).slice(0, 8).toUpperCase()}</span>
                <span className="text-[var(--term-fg-bright)]">{o.displayName}</span>
                {ciRankOf(o) !== "operative" && (
                  <span className="text-[var(--term-amber)] text-xs">{CI_RANK_LABELS[ciRankOf(o)]}</span>
                )}
                {o.id === viewer.id && (
                  <span className="text-[var(--term-fg-dim)] text-xs">(YOU)</span>
                )}
              </span>
              <span className="text-[var(--term-fg-dim)] text-xs shrink-0">
                {o.personalFile ? "DOSSIER ON FILE" : "NO DOSSIER"}
                {" · "}
                {o.createdAt.toISOString().slice(0, 10)}
              </span>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
