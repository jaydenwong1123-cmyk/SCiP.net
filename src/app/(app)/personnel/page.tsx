import Link from "next/link";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";

export default async function PersonnelPage() {
  const personnel = await db.user.findMany({
    where: { displayName: { not: null } },
    orderBy: [{ clearance: "desc" }, { displayName: "asc" }],
    select: { id: true, displayName: true, clearance: true, isOwner: true },
  });

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: PERSONNEL ROSTER ::</h1>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[var(--term-fg-dim)] border-b border-[var(--term-border)]">
            <th className="py-1 pr-4">NAME</th>
            <th className="py-1 pr-4">CLEARANCE</th>
          </tr>
        </thead>
        <tbody>
          {personnel.map((p) => (
            <tr key={p.id} className="border-b border-[var(--term-border)]/30">
              <td className="py-1 pr-4">
                <Link href={`/personnel/${p.id}`} className="term-link">
                  {p.displayName}
                  {p.isOwner ? " [OWNER]" : ""}
                </Link>
              </td>
              <td className="py-1 pr-4">{clearanceLabel(p.clearance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
