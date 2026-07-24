import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, canAnnotateMembers } from "@/lib/session";
import {
  clearanceDisplay,
  E5_DESIGNATION,
  R5_DESIGNATION,
} from "@/lib/clearance";
import { renderRedactedName } from "@/lib/redact";

// Within a single clearance rank, plain designations sort ahead of the
// alternate ones so rank 6 reads L-O5, L-E5, L-R5.
function designationWeight(designation?: string | null): number {
  if (designation === E5_DESIGNATION) return 1;
  if (designation === R5_DESIGNATION) return 2;
  return 0;
}

export default async function PersonnelPage() {
  const viewer = await requireUser();
  const personnel = await db.user.findMany({
    where: { displayName: { not: null } },
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

  // The DB sort already orders by clearance (desc) then name; refine so that
  // within a rank the alternate designations fall into L-O5, L-E5, L-R5 order.
  personnel.sort((a, b) => {
    if (a.clearance !== b.clearance) return b.clearance - a.clearance;
    const dw = designationWeight(a.designation) - designationWeight(b.designation);
    if (dw !== 0) return dw;
    return (a.displayName ?? "").localeCompare(b.displayName ?? "");
  });

  return (
    <div className="space-y-4">
      <div className="term-panel">
        <h1 className="text-lg tracking-widest">:: PERSONNEL ROSTER ::</h1>
      </div>

      <div className="term-panel space-y-2">
        {personnel.length === 0 && <p className="text-sm">NO PERSONNEL ON RECORD.</p>}
        {personnel.map((p) => {
          return (
            <Link
              key={p.id}
              href={`/personnel/${p.id}`}
              className="flex justify-between text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
            >
              <span>
                {flaggedIds.has(p.id) && (
                  <span className="text-[var(--term-red)]" title="FLAGGED">⚑ </span>
                )}
                {p.id === viewer.id
                  ? p.displayName
                  : renderRedactedName(p.displayName ?? "", viewer)}
                {p.department && (
                  <span className="text-[var(--term-fg-dim)]"> — {p.department}</span>
                )}
              </span>
              <span className="text-[var(--term-fg-dim)]">
                [{clearanceDisplay(p.clearance, p.designation)}]
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
