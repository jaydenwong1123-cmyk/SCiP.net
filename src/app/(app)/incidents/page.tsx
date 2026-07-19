import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { severityColor } from "@/lib/incident";

export default async function IncidentsPage() {
  const user = await requireUser();

  const reports = await db.incidentReport.findMany({
    where: { clearanceRequired: { lte: user.clearance } },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="term-panel flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: INCIDENT REPORTS ::</h1>
        <Link href="/incidents/new" className="term-button text-sm">
          [+ FILE REPORT]
        </Link>
      </div>

      <div className="term-panel space-y-2">
        {reports.length === 0 && (
          <p className="text-sm">NO REPORTS ACCESSIBLE AT YOUR CLEARANCE.</p>
        )}
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/incidents/${r.id}`}
            className="flex flex-wrap justify-between gap-x-4 text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
          >
            <span className="flex items-center gap-2 min-w-0 break-words">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: severityColor(r.severity) }}
                aria-hidden
              />
              {r.title}
            </span>
            <span className="text-[var(--term-fg-dim)] shrink-0">
              <span style={{ color: severityColor(r.severity) }}>
                {r.severity.toUpperCase()}
              </span>{" "}
              · [{clearanceLabel(r.clearanceRequired)}] — {r.author.displayName}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
