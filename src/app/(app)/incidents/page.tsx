import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { severityColor } from "@/lib/incident";
import { SeverityBadge, SignalDot } from "@/components/signal-badge";

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
        {user.canFileIncident && (
          <Link href="/incidents/new" className="term-button text-sm">
            [+ FILE REPORT]
          </Link>
        )}
      </div>

      <div className="term-panel space-y-2">
        {reports.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__glyph" aria-hidden>
              ⚠
            </span>
            <p className="empty-state__title">NO REPORTS ON FILE</p>
            <p className="text-sm">
              NOTHING HAS BEEN FILED AT OR BELOW YOUR CLEARANCE.
            </p>
            {user.canFileIncident && (
              <Link href="/incidents/new" className="term-button text-xs mt-1">
                FILE THE FIRST REPORT
              </Link>
            )}
          </div>
        )}
        {reports.map((r) => (
          <Link
            key={r.id}
            href={`/incidents/${r.id}`}
            className="flex flex-wrap justify-between gap-x-4 text-sm term-row border-b border-[var(--term-border)]/30 term-link"
          >
            <span className="flex items-center gap-2 min-w-0 break-words">
              <SignalDot color={severityColor(r.severity)} />
              {r.title}
              {r.revisionCount > 0 && (
                <span className="text-[10px] text-[var(--term-fg-dim)]">
                  REV {r.revisionCount}
                </span>
              )}
            </span>
            <span className="text-[var(--term-fg-dim)] shrink-0 flex items-center gap-2">
              <SeverityBadge severity={r.severity} />
              <span>
                [{clearanceLabel(r.clearanceRequired)}] — {r.author.displayName}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
