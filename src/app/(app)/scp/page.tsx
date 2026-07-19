import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";
import { CLASSIFICATIONS, classificationColor } from "@/lib/classification";

export default async function ScpListPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; level?: string }>;
}) {
  const user = await requireUser();
  const { class: classParam, level: levelParam } = await searchParams;

  const activeClass =
    classParam && CLASSIFICATIONS.some((c) => c.name === classParam)
      ? classParam
      : null;
  const levelNum = levelParam ? parseInt(levelParam, 10) : NaN;
  const activeLevel =
    Number.isInteger(levelNum) && levelNum >= 1 && levelNum <= user.clearance
      ? levelNum
      : null;

  const files = await db.scpFile.findMany({
    where: {
      clearanceRequired: activeLevel
        ? { equals: activeLevel }
        : { lte: user.clearance },
      ...(activeClass ? { classification: activeClass } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { author: { select: { displayName: true } } },
  });

  // Levels the viewer can actually read files at.
  const readableLevels = CLEARANCE_LEVELS.filter((l) => l.rank <= user.clearance);

  const qs = (next: { class?: string | null; level?: string | null }) => {
    const params = new URLSearchParams();
    const c = next.class === undefined ? activeClass : next.class;
    const l = next.level === undefined ? activeLevel?.toString() : next.level;
    if (c) params.set("class", c);
    if (l) params.set("level", l);
    const s = params.toString();
    return s ? `/scp?${s}` : "/scp";
  };

  const chip = (active: boolean) =>
    `text-xs px-2 py-0.5 border term-link ${
      active
        ? "border-[var(--term-fg-bright)] text-[var(--term-fg-bright)]"
        : "border-[var(--term-border)]/50"
    }`;

  return (
    <div className="space-y-4">
      <div className="term-panel flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest">:: SCP FILE ARCHIVE ::</h1>
        {user.canPostScp && (
          <Link href="/scp/new" className="term-button text-sm">
            [+ NEW FILE]
          </Link>
        )}
      </div>

      <div className="term-panel space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--term-fg-dim)] w-16">CLASS:</span>
          <Link href={qs({ class: null })} className={chip(!activeClass)}>
            ALL
          </Link>
          {CLASSIFICATIONS.map((c) => (
            <Link
              key={c.name}
              href={qs({ class: c.name })}
              className={chip(activeClass === c.name)}
              style={{ color: activeClass === c.name ? c.color : undefined }}
            >
              {c.name.toUpperCase()}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--term-fg-dim)] w-16">LEVEL:</span>
          <Link href={qs({ level: null })} className={chip(!activeLevel)}>
            ALL
          </Link>
          {readableLevels.map((l) => (
            <Link
              key={l.rank}
              href={qs({ level: l.rank.toString() })}
              className={chip(activeLevel === l.rank)}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="term-panel space-y-2">
        {files.length === 0 && (
          <p className="text-sm">NO FILES MATCH THE CURRENT FILTER.</p>
        )}
        {files.map((f) => (
          <Link
            key={f.id}
            href={`/scp/${f.id}`}
            className="flex flex-wrap justify-between gap-x-4 text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
          >
            <span className="flex items-center gap-2 min-w-0 break-words">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: classificationColor(f.classification) }}
                aria-hidden
              />
              {f.title}
            </span>
            <span className="text-[var(--term-fg-dim)] shrink-0">
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
