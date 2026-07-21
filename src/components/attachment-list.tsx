import {
  formatRemaining,
  formatSize,
  ATTACHMENT_TTL_DAYS,
} from "@/lib/attachments";

type AttachmentMeta = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  expiresAt: Date | null;
  uploaderName: string;
};

// Renders attachments for one record. Images are shown inline via the
// clearance-checked /attachments/[id] route — the bytes are never inlined into
// the page, so an uncleared viewer's browser is never sent them at all.
export function AttachmentList({
  attachments,
}: {
  attachments: AttachmentMeta[];
}) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 pt-2">
      {attachments.map((a) => (
        <figure
          key={a.id}
          className="border border-[var(--term-border)]/50 p-1 max-w-[14rem]"
        >
          <a href={`/attachments/${a.id}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element --
                next/image can't optimize a private, auth-gated route, and
                these are already capped at 512KB. */}
            <img
              src={`/attachments/${a.id}`}
              alt={a.filename}
              className="block max-w-full h-auto"
              loading="lazy"
            />
          </a>
          <figcaption className="text-[10px] text-[var(--term-fg-dim)] mt-1 break-words">
            {a.filename} · {formatSize(a.size)}
            <br />
            {a.expiresAt ? (
              <span title={`Attachments are purged ${ATTACHMENT_TTL_DAYS} days after upload`}>
                PURGES IN {formatRemaining(a.expiresAt)}
              </span>
            ) : (
              <span title="Retained indefinitely">RETAINED INDEFINITELY</span>
            )}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
