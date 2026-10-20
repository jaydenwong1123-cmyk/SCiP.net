import Link from "next/link";
import { requireInsurgent } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { ciEnabled } from "@/lib/ci/access";
import { SIEGE_DURATIONS_MIN, SIEGE_STATUS, SIEGE_STATUS_LABELS } from "@/lib/ci/config";
import { cooldownState } from "@/lib/ci/siege";
import { systemLabel } from "@/lib/ci/systems";
import { formatDuration } from "@/lib/hack/config";
import {
  leakFor,
  recentSieges,
  siegeFeed,
  siegeScoreboard,
} from "@/lib/ci/siege-store";
import { StationHead, HudPanel, Readout, EmptyState } from "@/components/hud";
import { SiegeConsole } from "@/components/ci/siege-console";
import { LaunchForm } from "./launch-form";
import { CI_CODE_KINDS, CI_CODE_LABELS, isCiCodeKind } from "@/lib/ci/codes";
import { liveCiCodesBy } from "@/lib/ci/code-store";
import {
  CI_RANK_LABELS,
  HOST_REFUSED,
  MAX_LIVE_CODES_PER_COMMANDER,
  canCreateCiCodes,
  canHostSiege,
  ciRankOf,
} from "@/lib/ci/ranks";
import {
  abandonAttackAction,
  generateCommandCodeAction,
  issueAttackAction,
  revokeCommandCodeAction,
  submitAttackAnswerAction,
} from "./actions";

export default async function InsurgencyPage() {
  const user = await requireInsurgent();
  const cfg = await getSiteConfig();
  const enabled = ciEnabled(cfg);

  if (!enabled) {
    return (
      <HudPanel code="00" title="UPLINK OFFLINE" status="STANDBY">
        <p className="text-sm">[OOC] The Chaos Insurgency event is not running right now.</p>
      </HudPanel>
    );
  }

  const rank = ciRankOf(user);
  const isHost = canHostSiege(user);
  const isCommand = canCreateCiCodes(user);

  const [feed, sieges, leak, myCodes] = await Promise.all([
    siegeFeed(true),
    recentSieges(8),
    leakFor(user.id),
    isCommand ? liveCiCodesBy(user.id) : Promise.resolve([]),
  ]);
  // eslint-disable-next-line react-hooks/purity -- server component; single read of wall-clock
  const now = Date.now();
  const cooldown = cooldownState(cfg, new Date(now));
  const scoreSiege = feed?.active?.id ?? sieges[0]?.id ?? null;
  const scores = scoreSiege ? await siegeScoreboard(scoreSiege, "ci") : [];
  const canLaunch = isHost && !feed?.active && cfg.ciAttacksEnabled && cooldown.ready;
  const atCodeCap = myCodes.length >= MAX_LIVE_CODES_PER_COMMANDER;

  return (
    <>
      <StationHead code="CI // FIELD UPLINK" title="OPERATION CONTROL">
        <Readout label="Rank" value={CI_RANK_LABELS[rank]} tone={isHost ? "fg" : "dim"} small />
        <Readout
          label="Status"
          value={feed?.active ? "SIEGE LIVE" : canLaunch ? "READY" : "HOLDING"}
          tone={feed?.active ? "red" : canLaunch ? "fg" : "dim"}
        />
        <Readout
          label="Next window"
          value={cooldown.ready ? "OPEN" : formatDuration(cooldown.retryAfterMs)}
          small
        />
      </StationHead>

      {leak && (
        <HudPanel code="!!" title="INTERCEPTED FILE" status="TIME-LIMITED" variant="alert">
          <p className="text-sm">
            The breach pulled an L-{leak.tier} file out of the archive. The uplink drops in{" "}
            {formatDuration(leak.expiresAt.getTime() - now)}.
          </p>
          <Link href={`/insurgency/leak/${leak.id}`} className="term-button inline-block mt-2">
            [OPEN INTERCEPT]
          </Link>
        </HudPanel>
      )}

      <HudPanel code="01" title="SIEGE" status={feed?.active ? "ENGAGED" : "STANDBY"}>
        {feed?.active ? (
          <SiegeConsole
            side="ci"
            initialFeed={feed}
            issue={issueAttackAction}
            submit={submitAttackAnswerAction}
            abandon={abandonAttackAction}
          />
        ) : (
          <div className="space-y-3">
            <p className="text-sm leading-snug">
              Launch a siege on the Foundation network. Every system you take down goes dark for
              its members; take two and the mainframe opens. RAISA will fight you for every point
              of integrity. Win, and you walk away with a classified file.
            </p>
            {!isHost && (
              <p className="text-sm text-[var(--term-amber)]">{HOST_REFUSED}</p>
            )}
            {!cfg.ciAttacksEnabled && (
              <p className="text-sm text-[var(--term-amber)]">[OOC] Attacks are disabled by staff.</p>
            )}
            {!cooldown.ready && (
              <p className="text-sm text-[var(--term-amber)]">
                THE NETWORK IS ON ALERT. NEXT WINDOW IN {formatDuration(cooldown.retryAfterMs)}.
              </p>
            )}
            {isHost && <LaunchForm durations={SIEGE_DURATIONS_MIN} disabled={!canLaunch} />}
          </div>
        )}
      </HudPanel>

      {isCommand && (
        <HudPanel code="DC" title="DELTA COMMAND // CODES" status={`${myCodes.length} UNUSED`}>
          <p className="text-xs text-[var(--term-fg-dim)] leading-snug mb-3">
            [OOC] Each ENLIST code creates one operative account; each LAUNCH code lets a Squadron
            Leader (or you) start one siege. A code is spent the moment it works. You can hold up
            to {MAX_LIVE_CODES_PER_COMMANDER} unused codes at once.
          </p>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {CI_CODE_KINDS.map((kind) => (
                <form key={kind} action={generateCommandCodeAction}>
                  <input type="hidden" name="kind" value={kind} />
                  <button type="submit" className="term-button term-button--sm" disabled={atCodeCap}>
                    [GENERATE {CI_CODE_LABELS[kind]}]
                  </button>
                </form>
              ))}
            </div>
            {atCodeCap && (
              <p className="text-sm text-[var(--term-amber)]">
                CODE LIMIT REACHED. REVOKE OR HAND OUT A CODE FIRST.
              </p>
            )}
            {myCodes.length === 0 ? (
              <EmptyState title="NO UNUSED CODES" />
            ) : (
              <ul className="text-sm space-y-1">
                {myCodes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="hud-readout__label">
                        {isCiCodeKind(c.kind) ? CI_CODE_LABELS[c.kind] : c.kind}
                      </span>{" "}
                      <code className="text-[var(--term-fg-bright)] select-all">{c.code}</code>
                    </span>
                    <form action={revokeCommandCodeAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="term-button term-button--sm term-button--ghost">
                        [REVOKE]
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </HudPanel>
      )}

      <HudPanel code="02" title="OPERATIVES" status={scores.length ? `${scores.length} ACTIVE` : "—"}>
        {scores.length === 0 ? (
          <EmptyState title="NO BREACHES LOGGED" />
        ) : (
          <ul className="text-sm space-y-1">
            {scores.map((s) => (
              <li key={s.name} className="flex justify-between gap-2">
                <span>{s.name}</span>
                <span className="text-[var(--term-fg-dim)]">
                  {s.solves} BREACH{s.solves === 1 ? "" : "ES"} · −{s.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </HudPanel>

      <HudPanel code="03" title="OPERATION LOG" status={`${sieges.length} ON FILE`}>
        {sieges.length === 0 ? (
          <EmptyState title="NO OPERATIONS ON FILE" />
        ) : (
          <ul className="text-sm space-y-1">
            {sieges.map((s) => {
              const fallen = s.systems.filter((x) => x.fallenAt).map((x) => systemLabel(x.system));
              return (
                <li key={s.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {s.startedAt.toISOString().slice(0, 16).replace("T", " ")} — {s.launchedByName}
                  </span>
                  <span
                    className={
                      s.status === SIEGE_STATUS.ciWon
                        ? "text-[var(--term-fg-bright)]"
                        : "text-[var(--term-fg-dim)]"
                    }
                  >
                    {SIEGE_STATUS_LABELS[s.status] ?? s.status}
                    {fallen.length > 0 && ` · ${fallen.join(", ")}`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </HudPanel>
    </>
  );
}
