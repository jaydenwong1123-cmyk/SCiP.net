import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canCreateScpFile } from "@/lib/doc-permissions";
import { authoringClearance } from "@/lib/clearance";
import { NewScpForm } from "./new-scp-form";
import { StationHead, HudPanel } from "@/components/hud";

export default async function NewScpPage() {
  const user = await requireUser();
  if (!canCreateScpFile(user)) redirect("/scp");

  return (
    <>
      <StationHead code="SEC-03 // NEW CONTAINMENT RECORD" title="FILE NEW SCP RECORD" />
      <HudPanel code="01" title="RECORD DRAFT">
        <NewScpForm maxClearance={authoringClearance(user)} />
      </HudPanel>
    </>
  );
}
