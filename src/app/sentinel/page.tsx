import { redirect } from "next/navigation";
import { getRealUser } from "@/lib/session";
import { needsSentinel, SENTINEL_QUESTION } from "@/lib/sentinel";
import { SentinelForm } from "./sentinel-form";

// Reads the session and the sentinel cookie; never prerendered.
export const dynamic = "force-dynamic";

export default async function SentinelPage() {
  const user = await getRealUser();
  if (!user) redirect("/login");
  // Anyone who has nothing to answer — every non-owner, and the owner once the
  // sentinel is held — simply belongs somewhere else.
  if (!(await needsSentinel(user))) redirect("/");

  return (
    <div className="min-h-screen flex flex-col">
      <div className="hud-banner hud-banner--ts">
        <span>TOP SECRET</span>
        <span aria-hidden>{"//"}</span>
        <span>OVERSEER CHALLENGE</span>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="secure-panel w-full max-w-md space-y-4">
          <div className="alert-stripe" aria-hidden />
          <div className="hud-recid">SCiP-220 // SENTINEL</div>
          <h1
            className="text-lg text-[var(--term-amber)]"
            style={{ letterSpacing: "0.18em" }}
          >
            IDENTITY NOT YET ESTABLISHED
          </h1>
          <p className="text-sm">
            CREDENTIALS ACCEPTED. THIS ACCOUNT REQUIRES A SECOND RESPONSE BEFORE
            THE TERMINAL WILL OPEN.
          </p>
          <div className="hud-tick-rule" aria-hidden />
          <SentinelForm question={SENTINEL_QUESTION} />
          <p className="text-[10px] text-[var(--term-fg-dim)]">
            REPEATED FAILURE TERMINATES THIS SESSION AND IS RECORDED AGAINST THIS
            ACCOUNT.
          </p>
        </div>
      </div>
      <div className="hud-banner hud-banner--ts">
        <span>ALL ACCESS ATTEMPTS ARE LOGGED AND TRACED</span>
      </div>
    </div>
  );
}
