import Link from "next/link";
import { requireInsurgent } from "@/lib/session";
import { StationHead, HudPanel, Lamp } from "@/components/hud";
import { DossierForm } from "./dossier-form";

// The operative's own dossier, editable here. Other operatives read it through
// the roster. It is not linked from, rendered on, or queryable through anything
// on the Foundation network, and requireInsurgent() keeps Foundation accounts out.
export default async function DossierPage() {
  const user = await requireInsurgent();

  return (
    <>
      <StationHead code="CI // OPERATIVE DOSSIER" title="DOSSIER">
        <Link href="/insurgency/roster" className="term-link text-sm">
          [OPERATIVE ROSTER]
        </Link>
      </StationHead>

      <div className="hud-fields">
        <div>
          <div className="hud-readout__label">Operative</div>
          <div className="text-sm mt-1 text-[var(--term-fg-bright)]">{user.displayName}</div>
        </div>
        <div>
          <div className="hud-readout__label">Record ID</div>
          <div className="hud-recid mt-1">CI-{String(user.id).slice(0, 8).toUpperCase()}</div>
        </div>
        <div>
          <div className="hud-readout__label">Enlisted</div>
          <div className="hud-recid mt-1">{user.createdAt.toISOString().slice(0, 10)}</div>
        </div>
        <div>
          <div className="hud-readout__label">File Status</div>
          <div className="mt-1">
            <Lamp state={user.personalFile ? "on" : "off"}>
              {user.personalFile ? "ON RECORD" : "NO FILE"}
            </Lamp>
          </div>
        </div>
      </div>

      <HudPanel code="01" title="DOSSIER" status="VISIBLE TO ALL OPERATIVES">
        <p className="text-[10px] text-[var(--term-fg-dim)] mb-2">
          [OOC] THIS FILE IS NOT VISIBLE TO FOUNDATION PERSONNEL.
        </p>
        <DossierForm initialContent={user.personalFile} />
      </HudPanel>
    </>
  );
}
