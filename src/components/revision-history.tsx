import { decodeMeta, summarizeChange } from "@/lib/revisions";
import { canBypassRedaction, renderRedacted } from "@/lib/redact";
import { clearanceLabel } from "@/lib/clearance";
import { ClassificationBadge, SeverityBadge } from "@/components/signal-badge";

type RevisionRow = {
  id: string;
  title: string;
  body: string;
  meta: string;
  reason: string;
  editorName: string;
  createdAt: Date;
};

function stamp(date: Date): string {
  return date.toISOString().slice(0, 16).replace("T", " ");
}

// Renders the stored history for a document, newest first.
//
// Each entry shows what the document looked like *before* that edit, so the
// list reads as a descending stack of prior versions with the live document
// at the top of the page.
export function RevisionHistory({
  revisions,
  current,
  viewer,
}: {
  revisions: RevisionRow[];
  current: { title: string; body: string };
  viewer: {
    clearance: number;
    isOwner: boolean;
    isCoOwner: boolean;
    isAdmin: boolean;
    isStaff: boolean;
  };
}) {
  if (revisions.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__glyph" aria-hidden>
          ⟲
        </span>
        <p className="empty-state__title">NO REVISIONS ON RECORD</p>
        <p className="text-sm">
          THIS DOCUMENT HAS NOT BEEN AMENDED SINCE IT WAS FILED.
        </p>
      </div>
    );
  }

  const bypass = canBypassRedaction(viewer);

  return (
    <ol className="space-y-4">
      {revisions.map((rev, i) => {
        // The version that replaced this one: the next-newer snapshot, or the
        // live document for the most recent entry.
        const successor = i === 0 ? current : revisions[i - 1]!;
        const { added, removed } = summarizeChange(rev.body, successor.body);
        const meta = decodeMeta(rev.meta);
        // Revisions are numbered oldest-first, so the labels stay stable as
        // new ones are added on top.
        const revNumber = revisions.length - i;

        return (
          <li
            key={rev.id}
            className="border-b border-[var(--term-border)]/30 pb-4 last:border-b-0"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
              <span className="text-[var(--term-fg-bright)]">
                REV {revNumber}
                <span className="text-[var(--term-fg-dim)]"> — {rev.editorName}</span>
              </span>
              <span className="text-xs text-[var(--term-fg-dim)]">
                {stamp(rev.createdAt)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[var(--term-fg-dim)]">
              <span className="text-[#3fb950]">+{added}</span>
              <span className="text-[var(--term-red)]">−{removed}</span>
              <span>LINES</span>
              {meta.classification && (
                <ClassificationBadge classification={meta.classification} />
              )}
              {meta.severity && <SeverityBadge severity={meta.severity} />}
              {meta.clearanceRequired !== undefined && (
                <span>[{clearanceLabel(meta.clearanceRequired)}]</span>
              )}
              {meta.location && <span>@ {meta.location}</span>}
            </div>

            {rev.title !== successor.title && (
              <p className="text-xs text-[var(--term-fg-dim)] mt-1 break-words">
                TITLE WAS: <span className="text-[var(--term-fg)]">{rev.title}</span>
              </p>
            )}

            {rev.reason && (
              <p className="text-sm mt-2 break-words">
                <span className="text-[var(--term-fg-dim)]">NOTE: </span>
                {rev.reason}
              </p>
            )}

            <details className="mt-2">
              <summary className="text-xs term-link cursor-pointer inline-block">
                VIEW THIS VERSION
              </summary>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm mt-2 border-l-2 border-[var(--term-border)]/40 pl-3">
                {renderRedacted(rev.body, viewer.clearance, bypass)}
              </pre>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
