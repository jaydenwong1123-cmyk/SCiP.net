import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, canAnnotateMembers } from "@/lib/session";
import {
  CLEARANCE_LEVELS,
  MAX_CLEARANCE,
  clearanceDisplay,
  E5_DESIGNATION,
  R5_DESIGNATION,
} from "@/lib/clearance";
import { renderRedactedName, redactNameToText } from "@/lib/redact";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";
import { FilterRow, FilterSearch } from "@/components/filter-bar";
import {
  filterHref,
  hasActiveFilters,
  pickRank,
  pickQuery,
} from "@/lib/filters";

// Within a single clearance rank, plain designations sort ahead of the
// alternate ones so rank 6 reads L-O5, L-E5, L-R5.
function designationWeight(designation?: string | null): number {
  if (designation === E5_DESIGNATION) return 1;
  if (designation === R5_DESIGNATION) return 2;
  return 0;
}

export default async function PersonnelPage({
  searchParams,
}: {
  searchParams: Promise<{ dept?: string; level?: string; q?: string }>;
}) {
  const viewer = await requireUser();
  const { dept: deptParam, level: levelParam, q: qParam } = await searchParams;

  // Unlike the document registries, the level facet here is NOT capped at the
  // viewer's own rank: the roster already shows every member's clearance to
  // everyone, so filtering by L-O5 discloses nothing the page did not.
  const activeLevel = pickRank(levelParam, 1, MAX_CLEARANCE);
  const query = pickQuery(qParam);

  const roster = await db.user.findMany({
    where: {
      displayName: { not: null },
      ...(activeLevel ? { clearance: activeLevel } : {}),
    },
    orderBy: [{ clearance: "desc" }, { displayName: "asc" }],
    select: {
      id: true,
      displayName: true,
      clearance: true,
      designation: true,
      department: true,
      isOwner: true,
      isAdmin: true,
      isStaff: true,
    },
  });

  // Department options are derived from the roster rather than from
  // lib/departments.ts, so the control lists the departments that actually have
  // people in them instead of sixteen entries most of which match nothing.
  const departments = [
    ...new Set(roster.map((p) => p.department).filter((d): d is string => !!d)),
  ].sort();
  const activeDept = deptParam && departments.includes(deptParam) ? deptParam : null;

  // NAME SEARCH IS APPLIED IN MEMORY, AGAINST THE REDACTED FORM. This is the
  // whole reason it is not a `contains` in the query above: a display name may
  // carry redaction markup (see renderRedactedName below), and a database
  // search would happily confirm a hidden name to a viewer who is only shown
  // block characters — one letter at a time. Matching what the viewer would
  // actually READ means a name you cannot see is a name you cannot find.
  //
  // Safe to do in memory because this roster is a faction's membership, not a
  // public directory; it is already fetched whole to be sorted below.
  const needle = query?.toUpperCase() ?? null;
  const personnel = roster.filter((p) => {
    if (activeDept && p.department !== activeDept) return false;
    if (!needle) return true;
    const visibleName =
      p.id === viewer.id
        ? (p.displayName ?? "")
        : redactNameToText(p.displayName ?? "", viewer);
    return (
      visibleName.toUpperCase().includes(needle) ||
      (p.department ?? "").toUpperCase().includes(needle)
    );
  });

  // Authorized personnel see a flag marker beside flagged members (but never on
  // their own row). The subject can't tell they're flagged.
  const showFlags = canAnnotateMembers(viewer);
  const flaggedIds = new Set<string>();
  if (showFlags) {
    const flagged = await db.memberNote.findMany({
      where: { flagged: true, subjectId: { not: viewer.id } },
      select: { subjectId: true },
    });
    for (const f of flagged) flaggedIds.add(f.subjectId);
  }

  const current = {
    dept: activeDept,
    level: activeLevel?.toString() ?? null,
    q: query,
  };
  const qs = (change: Record<string, string | null>) =>
    filterHref("/personnel", current, change);
  const filtered = hasActiveFilters(current);

  // The DB sort already orders by clearance (desc) then name; refine so that
  // within a rank the alternate designations fall into L-O5, L-E5, L-R5 order.
  personnel.sort((a, b) => {
    if (a.clearance !== b.clearance) return b.clearance - a.clearance;
    const dw = designationWeight(a.designation) - designationWeight(b.designation);
    if (dw !== 0) return dw;
    return (a.displayName ?? "").localeCompare(b.displayName ?? "");
  });

  return (
    <>
      <StationHead code="SEC-01 // PERSONNEL REGISTRY" title="PERSONNEL ROSTER">
        <Readout label="On Record" value={personnel.length} />
        {showFlags && (
          <Readout
            label="Flagged"
            value={flaggedIds.size}
            tone={flaggedIds.size > 0 ? "red" : "dim"}
          />
        )}
      </StationHead>

      <HudPanel code="01" title="QUERY" status="ROSTER FILTER">
        <div className="space-y-2">
          {departments.length > 0 && (
            <FilterRow
              label="DEPT"
              active={activeDept}
              options={departments.map((d) => ({
                value: d,
                // Departments have long formal names ("Recordkeeping &
                // Information Security Administration"); the segmented control
                // needs something that fits on one line.
                label: d.toUpperCase().slice(0, 22),
              }))}
              hrefFor={(value) => qs({ dept: value })}
            />
          )}
          <FilterRow
            label="LEVEL"
            active={activeLevel?.toString() ?? null}
            options={CLEARANCE_LEVELS.map((l) => ({
              value: l.rank.toString(),
              label: l.label,
            }))}
            hrefFor={(value) => qs({ level: value })}
          />
          <FilterSearch
            action="/personnel"
            query={query}
            hidden={{ dept: activeDept, level: activeLevel?.toString() }}
            placeholder="SEARCH NAME OR DEPARTMENT..."
          />
        </div>
      </HudPanel>

      <HudPanel
        code="02"
        title="REGISTRY"
        status={`${personnel.length} PERSONNEL`}
      >
        <div className="hud-list">
          {personnel.length === 0 && (
            <EmptyState glyph="◈" title="No personnel on record">
              {filtered && (
                <>
                  <p className="text-xs">
                    NO PERSONNEL MATCH THE CURRENT FILTER.
                  </p>
                  <Link
                    href="/personnel"
                    className="term-button term-button--sm mt-1"
                  >
                    CLEAR FILTERS
                  </Link>
                </>
              )}
            </EmptyState>
          )}
          {personnel.map((p) => (
            <Link
              key={p.id}
              href={`/personnel/${p.id}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
            >
              <span className="flex items-center gap-2 min-w-0">
                {flaggedIds.has(p.id) && (
                  <span className="text-[var(--term-red)]" title="FLAGGED">
                    ⚑
                  </span>
                )}
                <span className="hud-recid">
                  ID-{String(p.id).slice(0, 4).toUpperCase()}
                </span>
                <span className="text-[var(--term-fg-bright)]">
                  {p.id === viewer.id
                    ? p.displayName
                    : renderRedactedName(p.displayName ?? "", viewer)}
                </span>
                {p.department && (
                  <span className="text-[var(--term-fg-dim)] text-xs truncate">
                    — {p.department}
                  </span>
                )}
              </span>
              <span className="clearance-chip text-[10px] shrink-0">
                {clearanceDisplay(p.clearance, p.designation)}
              </span>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
