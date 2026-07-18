import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { classificationColor } from "@/lib/classification";

export default async function ScpListPage() {
  const user = await requireUser();

  const files = await db.scpFile.findMany({
    where: { clearanceRequired: { lte: user.clearance } },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });

  return (
    <div className="space-y-4">
      <div className="term-panel flex items-center justify-between">
        <h1 className="text-lg tracking-widest">:: SCP FILE ARCHIVE ::</h1>
        {user.canPostScp && (
          <Link href="/scp/new" className="term-button text-sm">
            [+ NEW FILE]
          </Link>
        )}
      </div>

      <div className="term-panel space-y-2">
        {files.length === 0 && <p className="text-sm">NO FILES ACCESSIBLE AT YOUR CLEARANCE.</p>}
        {files.map((f) => (
          <Link
            key={f.id}
            href={`/scp/${f.id}`}
            className="flex justify-between text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
          >
            <span className="flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: classificationColor(f.classification) }}
                aria-hidden
              />
              {f.title}
            </span>
            <span className="text-[var(--term-fg-dim)]">
              <span style={{ color: classificationColor(f.classification) }}>
                {f.classification.toUpperCase()}
              </span>{" "}
              · [{clearanceLabel(f.clearanceRequired)}] — {f.author.displayName}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
