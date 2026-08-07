import Link from "next/link";
import { requireUser } from "@/lib/session";
import { canCreateScpFile } from "@/lib/doc-permissions";
import { db } from "@/lib/db";
import { CLEARANCE_LEVELS, clearanceLabel } from "@/lib/clearance";
import { CLASSIFICATIONS, classificationColor } from "@/lib/classification";
import { ClassificationBadge, SignalDot } from "@/components/signal-badge";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";

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
      OR: [
        {
          clearanceRequired: activeLevel
            ? { equals: activeLevel }
            : { lte: user.clearance },
        },
        {
          accessGrants: {
            some: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
          },
        },
      ],
      ...(activeClass ? { classification: activeClass } : {}),
    },
    orderBy: { createdAt: "desc" },
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

  const seg = (active: boolean) => `hud-seg${active ? " hud-seg--on" : ""}`;

  return (
    <>
      <StationHead code="SEC-03 // ANOMALY ARCHIVE" title="SCP FILE ARCHIVE">
        <Readout label="Readable" value={files.length} />
        <Readout
          label="Max Clearance"
          value={clearanceLabel(user.clearance)}
          small
        />
        {canCreateScpFile(user) && (
          <Link href="/scp/new" className="term-button">
            + NEW FILE
          </Link>
        )}
      </StationHead>

      <HudPanel code="01" title="QUERY" status="ARCHIVE FILTER">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="hud-readout__label w-14">CLASS</span>
          <div className="hud-segmented">
            <Link href={qs({ class: null })} className={seg(!activeClass)}>
              ALL
            </Link>
            {CLASSIFICATIONS.map((c) => (
              <Link
                key={c.name}
                href={qs({ class: c.name })}
                className={seg(activeClass === c.name)}
                style={{ color: activeClass === c.name ? c.color : undefined }}
              >
                {c.name.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="hud-readout__label w-14">LEVEL</span>
          <div className="hud-segmented">
            <Link href={qs({ level: null })} className={seg(!activeLevel)}>
              ALL
            </Link>
            {readableLevels.map((l) => (
              <Link
                key={l.rank}
                href={qs({ level: l.rank.toString() })}
                className={seg(activeLevel === l.rank)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </HudPanel>

      <HudPanel
        code="02"
        title="REGISTRY"
        status={`${files.length} RECORD${files.length === 1 ? "" : "S"}`}
      >
        <div className="hud-list">
          {files.length === 0 && (
            <EmptyState title="No files match">
              <p className="text-xs">
                {activeClass || activeLevel
                  ? "NO DOCUMENTS MATCH THE CURRENT FILTER."
                  : "NO DOCUMENTS ARE READABLE AT YOUR CLEARANCE."}
              </p>
              {(activeClass || activeLevel) && (
                <Link href="/scp" className="term-button term-button--sm mt-1">
                  CLEAR FILTERS
                </Link>
              )}
            </EmptyState>
          )}
          {files.map((f) => (
            <Link
              key={f.id}
              href={`/scp/${f.id}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm term-row no-underline px-1"
            >
              <span className="flex items-center gap-2 min-w-0 break-words">
                <SignalDot color={classificationColor(f.classification)} />
                <span className="hud-recid">
                  SCP-{String(f.id).slice(0, 4).toUpperCase()}
                </span>
                <span className="text-[var(--term-fg-bright)]">{f.title}</span>
                {f.revisionCount > 0 && (
                  <span className="hud-recid">REV {f.revisionCount}</span>
                )}
              </span>
              <span className="shrink-0 flex items-center gap-2">
                <ClassificationBadge classification={f.classification} />
                <span className="hud-recid">
                  [{clearanceLabel(f.clearanceRequired)}]
                </span>
              </span>
            </Link>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
