import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import { ClearanceRequestForm } from "./request-form";

export default async function ClearanceRequestPage() {
  const user = await requireUser();
  const myRequests = await db.clearanceRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const hasPending = myRequests.some((r) => r.status === "pending");

  return (
    <div className="space-y-4">
      <div className="term-panel space-y-3">
        <h1 className="text-lg tracking-widest">:: CLEARANCE ADJUSTMENT REQUEST ::</h1>
        <p className="text-sm text-[var(--term-fg-dim)]">
          CURRENT CLEARANCE: {clearanceLabel(user.clearance)}
        </p>
        {hasPending ? (
          <p className="text-sm text-[var(--term-amber)]">
            YOU HAVE A PENDING REQUEST AWAITING REVIEW.
          </p>
        ) : (
          <ClearanceRequestForm currentClearance={user.clearance} />
        )}
      </div>

      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">REQUEST HISTORY</h2>
        {myRequests.length === 0 && <p className="text-sm">NO PAST REQUESTS.</p>}
        {myRequests.map((r) => (
          <div key={r.id} className="text-sm py-1 border-b border-[var(--term-border)]/30">
            REQUESTED {clearanceLabel(r.requestedLevel)} —{" "}
            <span
              className={
                r.status === "approved"
                  ? "text-[var(--term-fg-bright)]"
                  : r.status === "denied"
                  ? "text-[var(--term-red)]"
                  : "text-[var(--term-amber)]"
              }
            >
              {r.status.toUpperCase()}
            </span>{" "}
            — {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
          </div>
        ))}
      </div>
    </div>
  );
}
