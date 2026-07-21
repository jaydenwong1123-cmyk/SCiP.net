import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canCreateIncident } from "@/lib/doc-permissions";
import { NewIncidentForm } from "./new-incident-form";

export default async function NewIncidentPage() {
  const user = await requireUser();
  if (!canCreateIncident(user)) redirect("/incidents");

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: FILE INCIDENT REPORT ::</h1>
      <NewIncidentForm maxClearance={user.clearance} />
    </div>
  );
}
