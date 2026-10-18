import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireInsurgent } from "@/lib/session";
import { StationHead, HudPanel, Lamp } from "@/components/hud";

// One operative's dossier, read-only. Rendered as plain text: no redaction,
// mention or SCP cross-link pass, so nothing on the member network is queried.
export default async function OperativeDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireInsurgent();
  const { id } = await params;

  const operative = await db.user.findUnique({
    where: { id, isInsurgent: true },
    select: { id: true, displayName: true, createdAt: true, personalFile: true, suspended: true },
  });
  if (!operative || !operative.displayName || operative.suspended) notFound();

  const own = operative.id === viewer.id;

  return (
    <>
      <StationHead code="CI-02 // OPERATIVE DOSSIER" title={operative.displayName.toUpperCase()}>
        <Link href="/insurgency/roster" className="term-link text-sm">
          [BACK TO ROSTER]
        </Link>
      </StationHead>

      <div className="hud-fields">
        <div>
          <div className="hud-readout__label">Record ID</div>
          <div className="hud-recid mt-1">CI-{String(operative.id).slice(0, 8).toUpperCase()}</div>
        </div>
        <div>
          <div className="hud-readout__label">Enlisted</div>
          <div className="hud-recid mt-1">{operative.createdAt.toISOString().slice(0, 10)}</div>
        </div>
        <div>
          <div className="hud-readout__label">File Status</div>
          <div className="mt-1">
            <Lamp state={operative.personalFile ? "on" : "off"}>
              {operative.personalFile ? "ON RECORD" : "NO FILE"}
            </Lamp>
          </div>
        </div>
      </div>

      <HudPanel code="01" title="DOSSIER" status="CI EYES ONLY">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm term-panel term-panel--sub min-h-[10rem]">
          {operative.personalFile || "[NO DOSSIER ON RECORD]"}
        </pre>
        {own && (
          <Link href="/insurgency/dossier" className="term-button inline-block mt-3">
            [EDIT MY DOSSIER]
          </Link>
        )}
      </HudPanel>
    </>
  );
}
