import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canCreateIncident } from "@/lib/doc-permissions";
import { authoringClearance } from "@/lib/clearance";
import { NewIncidentForm } from "./new-incident-form";
import { StationHead, HudPanel } from "@/components/hud";

export default async function NewIncidentPage() {
  const user = await requireUser();
  if (!canCreateIncident(user)) redirect("/incidents");

  return (
    <>
      <StationHead code="SEC-04 // NEW BREACH REPORT" title="FILE INCIDENT REPORT" />
      <HudPanel code="01" title="REPORT DRAFT">
        <NewIncidentForm maxClearance={authoringClearance(user)} />
      </HudPanel>
    </>
  );
}
