import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canCreateScpFile } from "@/lib/doc-permissions";
import { db } from "@/lib/db";
import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";
import { CLASSIFICATIONS, classificationColor } from "@/lib/classification";
import { ClassificationBadge, SignalDot } from "@/components/signal-badge";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";
import { FilterRow, FilterSearch } from "@/components/filter-bar";
import {
  filterHref,
  hasActiveFilters,
  pickOption,
  pickRank,
  pickQuery,
  containsFilter,
} from "@/lib/filters";

export default async function ScpListPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; level?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { class: classParam, level: levelParam, q: qParam } = await searchParams;

  const activeClass = pickOption(
    classParam,
    CLASSIFICATIONS.map((c) => c.name)
  );
  // Capped at the viewer's own clearance, so the level row can never be used
  // to ask "does anything exist at L-5" from an L-2 account.
  const activeLevel = pickRank(levelParam, 1, user.clearance);
  const query = pickQuery(qParam);

  const files = await db.scpFile.findMany({
    where: {
      // The clearance/grant test and the facet filters are deliberately
      // separate AND-ed clauses. Folding the facets into the OR would let a
      // filter widen the result set past what the viewer may read.
      AND: [
        {
          OR: [
            {
              clearanceRequired: activeLevel
                ? { equals: activeLevel }
                : { lte: user.clearance },
            },
            {
              accessGrants: {
                some: {
                  userId: user.id,
                  revokedAt: null,
                  expiresAt: { gt: new Date() },
                },
              },
            },
          ],
        },
        ...(activeClass ? [{ classification: activeClass }] : []),
        // Title only, never body: a body search would report a hit inside a
        // passage the viewer is not cleared to read, which is exactly what
        // lib/redact.tsx exists to prevent. Titles are already shown in full
        // on this page, so searching them reveals nothing new.
        ...(query ? [{ title: containsFilter(query) }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
  });

  // Levels the viewer can actually read files at.
  const readableLevels = CLEARANCE_LEVELS.filter((l) => l.rank <= user.clearance);

  const current = {
    class: activeClass,
    level: activeLevel?.toString() ?? null,
    q: query,
  };
  const qs = (change: Record<string, string | null>) =>
    filterHref("/scp", current, change);
  const filtered = hasActiveFilters(current);

  return (
    <>
      <StationHead code="SEC-03 // ANOMALY ARCHIVE" title="SCP FILE ARCHIVE">
        <Readout label="Readable" value={files.length} />
        <Readout
          label="Max Clearance"
          value={clearanceLabel(user.clearance)}
          small
        />
        {canCreateScpFile(user) && (
          <Link href="/scp/new" className="term-button">
            + NEW FILE
          </Link>
        )}
      </StationHead>

      <HudPanel code="01" title="QUERY" status="ARCHIVE FILTER">
        <div className="space-y-2">
          <FilterRow
            label="CLASS"
            active={activeClass}
            options={CLASSIFICATIONS.map((c) => ({
              value: c.name,
              label: c.name.toUpperCase(),
              color: c.color,
            }))}
            hrefFor={(value) => qs({ class: value })}
          />
          <FilterRow
            label="LEVEL"
            active={activeLevel?.toString() ?? null}
            options={readableLevels.map((l) => ({
              value: l.rank.toString(),
              label: l.label,
            }))}
            hrefFor={(value) => qs({ level: value })}
          />
          <FilterSearch
            action="/scp"
            query={query}
            hidden={{ class: activeClass, level: activeLevel?.toString() }}
            placeholder="SEARCH FILE TITLES..."
          />
        </div>
      </HudPanel>

      <HudPanel
        code="02"
        title="REGISTRY"
        status={`${files.length} RECORD${files.length === 1 ? "" : "S"}`}
      >
        <div className="hud-list">
          {files.length === 0 && (
            <EmptyState title="No files match">
              <p className="text-xs">
                {filtered
                  ? "NO DOCUMENTS MATCH THE CURRENT FILTER."
                  : "NO DOCUMENTS ARE READABLE AT YOUR CLEARANCE."}
              </p>
              {filtered && (
                <Link href="/scp" className="term-button term-button--sm mt-1">
                  CLEAR FILTERS
                </Link>
              )}
            </EmptyState>
          )}
          {files.map((f) => (
            <Link
              key={f.id}
              href={`/scp/${f.id}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
            >
              <span className="flex items-center gap-2 min-w-0 break-words">
                <SignalDot color={classificationColor(f.classification)} />
                <span className="hud-recid">
                  SCP-{String(f.id).slice(0, 4).toUpperCase()}
                </span>
                <span className="text-[var(--term-fg-bright)]">{f.title}</span>
                {f.revisionCount > 0 && (
                  <span className="hud-recid">REV {f.revisionCount}</span>
                )}
              </span>
              <span className="shrink-0 flex items-center gap-2">
                <ClassificationBadge classification={f.classification} />
                <span className="hud-recid">
                  [{clearanceLabel(f.clearanceRequired)}]
                </span>
              </span>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
