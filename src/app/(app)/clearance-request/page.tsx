import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  clearanceLabel,
  clearanceDisplay,
  authoringClearance,
} from "@/lib/clearance";
import { ClearanceRequestForm } from "./request-form";
import {
  StationHead,
  HudPanel,
  Readout,
  Lamp,
  EmptyState,
} from "@/components/hud";

export default async function ClearanceRequestPage() {
  const user = await requireUser();
  const myRequests = await db.clearanceRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    include: { reviewedBy: { select: { displayName: true } } },
  });
  const hasPending = myRequests.some((r) => r.status === "pending");

  return (
    <>
      <StationHead code="SEC-06 // CLEARANCE ADJUSTMENT" title="ELEVATION REQUEST">
        {/* The member's real standing, not an effective clearance propped up
            by a temporary intrusion grant — this page is about what they are
            actually entitled to. */}
        <Readout
          label="Current Clearance"
          value={clearanceDisplay(authoringClearance(user), user.designation)}
        />
        <div className="hud-readout">
          <span className="hud-readout__label">Request</span>
          <Lamp state={hasPending ? "warn" : "off"}>
            {hasPending ? "PENDING REVIEW" : "NONE OPEN"}
          </Lamp>
        </div>
      </StationHead>

      <HudPanel code="01" title="SUBMIT REQUEST">
        {hasPending ? (
          <p className="text-sm text-[var(--term-amber)]">
            YOU HAVE A PENDING REQUEST AWAITING REVIEW.
          </p>
        ) : (
          <ClearanceRequestForm currentClearance={authoringClearance(user)} />
        )}
      </HudPanel>

      <HudPanel
        code="02"
        title="REQUEST HISTORY"
        status={`${myRequests.length} ON FILE`}
      >
        <div className="hud-list">
          {myRequests.length === 0 && (
            <EmptyState glyph="◇" title="No past requests" />
          )}
          {myRequests.map((r) => (
            <div key={r.id} className="text-sm term-row space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="hud-recid">
                  REQ-{String(r.id).slice(0, 4).toUpperCase()}
                </span>
                <span>{clearanceLabel(r.requestedLevel)}</span>
                <Lamp
                  state={
                    r.status === "approved"
                      ? "on"
                      : r.status === "denied"
                        ? "alert"
                        : "warn"
                  }
                >
                  {r.status.toUpperCase()}
                </Lamp>
                <span className="hud-recid ml-auto">
                  {r.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  {r.reviewedBy && ` · BY ${r.reviewedBy.displayName}`}
                </span>
              </div>
              {r.reviewNote && (
                <div className="text-[var(--term-fg-dim)] text-xs pl-2">
                  ▸ NOTE: {r.reviewNote}
                </div>
              )}
            </div>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
