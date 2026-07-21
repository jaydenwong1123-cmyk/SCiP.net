import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { canCreateScpFile } from "@/lib/doc-permissions";
import { NewScpForm } from "./new-scp-form";

export default async function NewScpPage() {
  const user = await requireUser();
  if (!canCreateScpFile(user)) redirect("/scp");

  return (
    <div className="term-panel space-y-4">
      <h1 className="text-lg tracking-widest">:: FILE NEW SCP RECORD ::</h1>
      <NewScpForm maxClearance={user.clearance} />
    </div>
  );
}
