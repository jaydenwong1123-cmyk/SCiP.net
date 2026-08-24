import { requireUser, hasStaffPowers } from "@/lib/session";
import { clearanceLabel } from "@/lib/clearance";
import {
  MAX_STAGE,
  RUN_STATUS,
  STAGES,
  formatDuration,
} from "@/lib/hack/config";
import {
  getOrIssueChallenge,
  publicChallenge,
  pruneHackChallenges,
  resolveStaleRuns,
} from "@/lib/hack/engine";
import { deliverDuel, pruneDuelPayloads } from "@/lib/hack/duel";
import { getActiveHackGrant, hackCooldownState } from "@/lib/hack/grant";
import { hackStreakForUser } from "@/lib/hack/streak";
import { toolInventory } from "@/lib/hack/tools";
import {
  activeSanction,
  blocksRuns,
  cooldownMultiplier,
  SANCTION_LABELS,
  isSanctionLevel,
} from "@/lib/hack/sanctions";
import { RunConsole } from "./run-console";
import { BreachForm } from "./breach-form";
import { StreakPanel } from "./streak-panel";
import { ToolkitPanel } from "./toolkit-panel";

export default async function HackPage() {
  const user = await requireUser();
  void pruneHackChallenges();
  void pruneDuelPayloads();

  // Resolve anything left dangling by a closed tab before reading state, so
  // the page never shows a run that has in fact already timed out.
  const run = await resolveStaleRuns(user.id);
  const tierLabels = STAGES.map((s) => clearanceLabel(s.tier));

  if (run && run.status === RUN_STATUS.active) {
    // A live duel outranks whatever intrusion challenge was in flight when the
    // officer engaged — that one is abandoned, and rendering it would show a
    // puzzle whose clock has already gone. Delivering here rather than waiting
    // for the console's first poll also means a reload mid-duel comes straight
    // back to the duel.
    const duel = await deliverDuel(run.id);
    const liveDuel = duel?.kind === "live" ? duel.duel : null;

    const challenge =
      liveDuel || run.atCheckpoint
        ? null
        : publicChallenge(await getOrIssueChallenge(run));

    const kit = await toolInventory(user.id);

    return (
      <div className="space-y-4">
        <div className="term-panel">
          <h1 className="text-lg tracking-widest text-[var(--term-red)]">
            :: INTRUSION IN PROGRESS ::
          </h1>
        </div>
        <RunConsole
          initial={challenge}
          initialDuel={liveDuel}
          atCheckpoint={run.atCheckpoint}
          stage={run.stage}
          clearedStages={run.clearedStages}
          tierLabels={tierLabels}
          maxStage={MAX_STAGE}
          toolkit={kit}
          deadmanArmed={run.deadmanArmed}
        />
      </div>
    );
  }

  const staff = hasStaffPowers(user);
  const sanction = await activeSanction(user.id);
  const [grant, cooldown, streak, kit] = await Promise.all([
    getActiveHackGrant(user.id),
    // Same multiplier the action applies, so the notice on this page and the
    // refusal from beginHackRunAction can never disagree about the wait.
    hackCooldownState(user.id, staff, cooldownMultiplier(sanction)),
    hackStreakForUser(user.id),
    toolInventory(user.id),
  ]);
  const barred = blocksRuns(sanction);
  // eslint-disable-next-line react-hooks/purity -- server component; single read of wall-clock for expiry display
  const now = Date.now();

  return (
    // hack-root suppresses the facility's blueprint grid and lays down harsher
    // red scanlines instead. The intruder's console is deliberately the inverse
    // of the ops HUD — it should not look like facility equipment.
    <div className="hack-root space-y-4 p-1">
      <div className="hud-banner hud-banner--alert-red">
        ⚠ UNSANCTIONED INTERFACE — NO CLASSIFICATION AUTHORITY ⚠
      </div>

      <div className="alert-panel space-y-3">
        <div className="alert-stripe" />
        <h1
          className="text-lg text-[var(--term-red)]"
          style={{ letterSpacing: "0.18em" }}
        >
          :: UNAUTHORIZED ACCESS TERMINAL ::
        </h1>
        <div className="space-y-2 text-sm">
          <p>
            THIS INTERFACE IS NOT SANCTIONED. ATTEMPTING TO ELEVATE YOUR OWN
            CLEARANCE BY CIRCUMVENTING THE ACCESS CONTROL SYSTEM IS A CLASS-3
            INFRACTION UNDER SITE DIRECTIVE 11-C.
          </p>
          <p className="text-[var(--term-amber)]">
            EVERY ATTEMPT IS LOGGED AND TRACED BY THE RECORDKEEPING &amp;
            INFORMATION SECURITY ADMINISTRATION. YOUR IDENTITY IS RECORDED AT
            THE MOMENT OF BREACH AND WILL BE RECOVERED.
          </p>
        </div>

        <div className="space-y-1 text-xs text-[var(--term-fg-dim)]">
          <p>
            {"> "}FIVE LAYERS. EACH BREACHED LAYER BANKS A HIGHER TEMPORARY
            CLEARANCE.
          </p>
          <p>
            {"> "}AFTER EACH LAYER YOU MAY EXTRACT WITH WHAT YOU HOLD, OR PUSH
            DEEPER.
          </p>
          <p className="text-[var(--term-red)]">
            {"> "}FAILURE FORFEITS EVERY BANKED TIER AND DOUBLES THE COOLDOWN.
          </p>
          <p>
            {"> "}GRANTED CLEARANCE IS READ-ONLY. IT CONFERS NO AUTHORITY TO
            AUTHOR, EDIT, OR ANNOTATE.
          </p>
        </div>

        {/* The layer ladder as a segmented bar, so the depth/payout curve is
            visible before the table spells it out. */}
        <div className="hack-ladder">
          {STAGES.map((s) => (
            <div
              key={s.stage}
              className={`hack-stage${s.stage >= 3 ? " hack-stage--active" : ""}`}
            >
              L{s.stage}
              <span className="block">{clearanceLabel(s.tier)}</span>
            </div>
          ))}
        </div>

        <div className="hud-table-wrap">
          <table className="hud-table">
            <thead>
              <tr>
                <th>LAYER</th>
                <th>PAYS</th>
                <th>ROUNDS</th>
                <th>HOLD</th>
              </tr>
            </thead>
            <tbody>
              {STAGES.map((s) => (
                <tr
                  key={s.stage}
                  className={s.stage >= 3 ? "text-[var(--term-amber)]" : ""}
                >
                  <td>{s.stage}</td>
                  <td>{clearanceLabel(s.tier)}</td>
                  <td>{s.rounds}</td>
                  <td>{formatDuration(s.grantMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <StreakPanel streak={streak} />

      <ToolkitPanel inventory={kit} />

      {/* A sanction is announced in full — reason and expiry both — because
          that is what separates it from the silent conduct flag and what makes
          the appeal route in IT SUPPORT usable. */}
      {sanction && (
        <div className="alert-panel space-y-1 text-sm">
          <div className="alert-stripe" aria-hidden />
          <div className="hud-recid">ADMINISTRATIVE ACTION</div>
          <h2
            className="text-sm text-[var(--term-red)]"
            style={{ letterSpacing: "0.16em" }}
          >
            {isSanctionLevel(sanction.level)
              ? SANCTION_LABELS[sanction.level]
              : "TERMINAL SANCTION"}
          </h2>
          {sanction.reason && <p>REASON: {sanction.reason}</p>}
          <p className="text-xs text-[var(--term-fg-dim)]">
            {sanction.expiresAt
              ? `LIFTS IN ${formatDuration(
                  sanction.expiresAt.getTime() - now
                )}.`
              : "NO EXPIRY SET."}{" "}
            TO CONTEST THIS, OPEN A CONDUCT REVIEW APPEAL IN IT SUPPORT.
          </p>
        </div>
      )}

      {grant && (
        <div className="alert-panel space-y-1 text-sm">
          <div className="hud-recid">SESSION STATE</div>
          <h2
            className="text-sm text-[var(--term-fg-bright)]"
            style={{ letterSpacing: "0.16em" }}
          >
            ACTIVE ILLICIT ACCESS
          </h2>
          <p>
            {clearanceLabel(grant.tier)} READ ACCESS — EXPIRES IN{" "}
            {formatDuration(grant.expiresAt.getTime() - now)}
          </p>
        </div>
      )}

      <div className="term-panel space-y-3">
        {cooldown.bypassed && (
          <p className="text-xs text-[var(--term-fg-dim)]">
            STAFF OVERRIDE — COOLDOWN NOT ENFORCED ON THIS ACCOUNT.
          </p>
        )}
        {/* A blacklist outranks the cooldown notice: showing a countdown to a
            member who would still be refused at the end of it is worse than
            useless. Mirrors the check order in beginHackRunAction. */}
        {barred ? (
          <div className="space-y-1">
            <p className="text-sm text-[var(--term-red)]">
              TERMINAL BLACKLISTED — NO INTRUSION MAY BE STARTED.
            </p>
            <p className="text-xs text-[var(--term-fg-dim)]">
              THIS IS AN ADMINISTRATIVE ACTION, NOT A COOLDOWN. SEE THE NOTICE
              ABOVE.
            </p>
          </div>
        ) : cooldown.blocked ? (
          <div className="space-y-1">
            <p className="text-sm text-[var(--term-red)]">
              COUNTERMEASURE COOLDOWN ACTIVE.
            </p>
            <p className="text-xs text-[var(--term-fg-dim)]">
              {cooldown.penalty
                ? "PREVIOUS INTRUSION WAS REPELLED — EXTENDED LOCKOUT IN EFFECT. "
                : ""}
              {cooldown.restricted
                ? "TERMINAL RESTRICTED BY ADMINISTRATION — COOLDOWN EXTENDED. "
                : ""}
              RETRY IN {formatDuration(cooldown.retryAfterMs)}.
            </p>
          </div>
        ) : (
          <BreachForm />
        )}
      </div>
    </div>
  );
}
