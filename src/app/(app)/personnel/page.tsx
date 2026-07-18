import Link from "next/link";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";

export default async function PersonnelPage() {
  const personnel = await db.user.findMany({
    where: { displayName: { not: null } },
    orderBy: [{ clearance: "desc" }, { displayName: "asc" }],
    select: {
      id: true,
      displayName: true,
      clearance: true,
      department: true,
      isOwner: true,
      isAdmin: true,
      isStaff: true,
    },
  });

  return (
    <div className="space-y-4">
      <div className="term-panel">
        <h1 className="text-lg tracking-widest">:: PERSONNEL ROSTER ::</h1>
      </div>

      <div className="term-panel space-y-2">
        {personnel.length === 0 && <p className="text-sm">NO PERSONNEL ON RECORD.</p>}
        {personnel.map((p) => {
          const role = p.isOwner
            ? "OWNER"
            : p.isAdmin
              ? "ADMIN"
              : p.isStaff
                ? "STAFF"
                : null;
          return (
            <Link
              key={p.id}
              href={`/personnel/${p.id}`}
              className="flex justify-between text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
            >
              <span>
                {p.displayName}
                {role && <span className="text-[var(--term-amber)]"> [{role}]</span>}
                {p.department && (
                  <span className="text-[var(--term-fg-dim)]"> — {p.department}</span>
                )}
              </span>
              <span className="text-[var(--term-fg-dim)]">
                [{clearanceLabel(p.clearance)}]
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
