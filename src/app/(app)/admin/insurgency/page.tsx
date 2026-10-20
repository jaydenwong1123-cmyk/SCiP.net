import Link from "next/link";
import { db } from "@/lib/db";
import { requireRootOwner } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { CI_MODES, CI_MODE_LABELS, ciModeOf } from "@/lib/ci/access";
import { CI_CODE_KINDS, CI_CODE_LABELS, isCiCodeKind } from "@/lib/ci/codes";
import { liveCiCodes, recentlyUsedCiCodes } from "@/lib/ci/code-store";
import { CI_RANKS, CI_RANK_LABELS, ciRankOf } from "@/lib/ci/ranks";
import { cooldownState, isDefaced } from "@/lib/ci/siege";
import { SIEGE_STATUS_LABELS } from "@/lib/ci/config";
import { systemLabel } from "@/lib/ci/systems";
import { recentSieges, settleSiegeIfDue, publicSiege } from "@/lib/ci/siege-store";
import { formatDuration } from "@/lib/hack/config";
import { StationHead, HudPanel, Readout, EmptyState, Lamp } from "@/components/hud";
import {
  setCiModeAction,
  setCiSwitchAction,
  abortSiegeAction,
  clearCooldownAction,
  clearDefacementAction,
  forceRestoreAction,
  setEarlyAccessAction,
  setCiSuspendedAction,
  deleteCiAccountAction,
  setCiRankAction,
  generateCiCodeAction,
  revokeCiCodeAction,
} from "./actions";

// INSURGENCY CONTROL — the owner's panel for the Chaos Insurgency siege.
// Strictly the seeded owner (requireRootOwner), like OMEGA; the Admin page only
// shows the link to them.
//
// The out-of-roleplay codes are generated here, one use each, alongside every
// other switch: who can see the siege, whether CI can sign up or attack,
// aborting a siege, clearing locks.
export default async function InsurgencyControlPage() {
  await requireRootOwner();
  const cfg = await getSiteConfig();
  const mode = ciModeOf(cfg);
  const now = new Date();

  const [active, sieges, testers, candidates, ciAccounts, locked, codes, usedCodes] = await Promise.all([
    settleSiegeIfDue(now),
    recentSieges(10),
    db.user.findMany({
      where: { earlyAccess: true, isInsurgent: false },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true, email: true, department: true },
    }),
    db.user.findMany({
      where: { earlyAccess: false, isInsurgent: false, suspended: false, displayName: { not: null } },
      orderBy: { displayName: "asc" },
      select: { id: true, displayName: true },
    }),
    db.user.findMany({
      where: { isInsurgent: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, displayName: true, email: true, suspended: true, createdAt: true, ciRank: true },
    }),
    db.ciSiegeSystem.findMany({ where: { lockedUntil: { gt: now } } }),
    liveCiCodes(),
    recentlyUsedCiCodes(10),
  ]);

  const cooldown = cooldownState(cfg, now);
  const live = active ? publicSiege(active) : null;

  return (
    <>
      <StationHead code="ADM // INSURGENCY CONTROL" title="CHAOS INSURGENCY SIEGE">
        <Readout
          label="Mode"
          value={CI_MODE_LABELS[mode]}
          tone={mode === "live" ? "red" : mode === "early" ? "amber" : "dim"}
        />
        <Readout label="Testers" value={testers.length} small />
        <Readout label="CI accounts" value={ciAccounts.length} small />
        <Link href="/admin" className="term-link text-sm">
          [ADMIN]
        </Link>
      </StationHead>

      <HudPanel code="01" title="ROLLOUT" status={CI_MODE_LABELS[mode]}>
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug mb-3">
          OFF hides everything. EARLY ACCESS shows the siege — banner, locks, defacement, RAISA
          desk and alerts — only to the testers below; every other member sees the site exactly
          as before. LIVE FOR ALL opens it to everyone.
        </p>
        <div className="flex flex-wrap gap-2">
          {CI_MODES.map((m) => (
            <form key={m} action={setCiModeAction}>
              <input type="hidden" name="mode" value={m} />
              <button
                type="submit"
                className={`term-button term-button--sm${m === mode ? "" : " term-button--ghost"}`}
                disabled={m === mode}
              >
                {CI_MODE_LABELS[m]}
              </button>
            </form>
          ))}
        </div>
      </HudPanel>

      <HudPanel code="02" title="SWITCHES" status={cooldown.ready ? "WINDOW OPEN" : "COOLDOWN"}>
        <ul className="text-sm space-y-2">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <Lamp state={cfg.ciSignupEnabled ? "on" : "off"}>CI SIGNUP (/enlist)</Lamp>
            </span>
            <form action={setCiSwitchAction}>
              <input type="hidden" name="switch" value="signup" />
              <input type="hidden" name="on" value={String(!cfg.ciSignupEnabled)} />
              <button type="submit" className="term-button term-button--sm">
                {cfg.ciSignupEnabled ? "[CLOSE]" : "[OPEN]"}
              </button>
            </form>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <Lamp state={cfg.ciAttacksEnabled ? "on" : "off"}>CI ATTACKS</Lamp>
            </span>
            <form action={setCiSwitchAction}>
              <input type="hidden" name="switch" value="attacks" />
              <input type="hidden" name="on" value={String(!cfg.ciAttacksEnabled)} />
              <button type="submit" className="term-button term-button--sm">
                {cfg.ciAttacksEnabled ? "[DISABLE]" : "[ENABLE]"}
              </button>
            </form>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>
              COOLDOWN: {cooldown.ready ? "NONE" : formatDuration(cooldown.retryAfterMs)}
            </span>
            {!cooldown.ready && (
              <form action={clearCooldownAction}>
                <button type="submit" className="term-button term-button--sm">
                  [CLEAR]
                </button>
              </form>
            )}
          </li>
          {isDefaced(cfg, now) && (
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>
                DEFACED FOR {formatDuration(cfg.ciDefacedUntil!.getTime() - now.getTime())}
              </span>
              <form action={clearDefacementAction}>
                <button type="submit" className="term-button term-button--sm">
                  [CLEAR]
                </button>
              </form>
            </li>
          )}
        </ul>
      </HudPanel>

      <HudPanel
        code="03"
        title="ONE-USE CODES"
        status={`${codes.length} UNUSED`}
      >
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug mb-3">
          Each ENLIST code creates one Chaos Insurgency account; each LAUNCH code starts one
          siege. A code is spent the moment it works — generate a fresh one per player and per
          attack. A launch turned away (cooldown, siege already running) does not spend it.
        </p>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CI_CODE_KINDS.map((kind) => (
              <form key={kind} action={generateCiCodeAction}>
                <input type="hidden" name="kind" value={kind} />
                <button type="submit" className="term-button term-button--sm">
                  [GENERATE {CI_CODE_LABELS[kind]}]
                </button>
              </form>
            ))}
          </div>
          {codes.length === 0 ? (
            <EmptyState title="NO UNUSED CODES" />
          ) : (
            <ul className="text-sm space-y-1">
              {codes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="hud-readout__label">
                      {isCiCodeKind(c.kind) ? CI_CODE_LABELS[c.kind] : c.kind}
                    </span>{" "}
                    <code className="text-[var(--term-fg-bright)] select-all">{c.code}</code>
                  </span>
                  <form action={revokeCiCodeAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" className="term-button term-button--sm term-button--ghost">
                      [REVOKE]
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          {usedCodes.length > 0 && (
            <div className="space-y-1">
              <p className="hud-readout__label">RECENTLY USED</p>
              <ul className="text-xs text-[var(--term-fg-dim)] space-y-1">
                {usedCodes.map((c) => (
                  <li key={c.id}>
                    {c.code} — {c.usedByName || "—"} ·{" "}
                    {c.usedAt!.toISOString().slice(0, 16).replace("T", " ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </HudPanel>

      <HudPanel
        code="04"
        title="LIVE SIEGE"
        status={live ? `ENDS IN ${formatDuration(live.endsAt - now.getTime())}` : "NONE"}
        variant={live ? "alert" : undefined}
      >
        {live ? (
          <div className="space-y-3">
            <ul className="text-sm space-y-1">
              {live.systems.map((s) => (
                <li key={s.id} className="flex justify-between gap-2">
                  <span>{s.label}</span>
                  <span className={s.fallen ? "text-[var(--term-red)]" : ""}>
                    {s.fallen ? "OFFLINE" : `${s.integrity}/${s.max}`}
                  </span>
                </li>
              ))}
            </ul>
            <form action={abortSiegeAction}>
              <button type="submit" className="term-button" style={{ borderColor: "var(--term-red)" }}>
                [ABORT SIEGE — NO LOCKS, NO LEAK]
              </button>
            </form>
          </div>
        ) : (
          <EmptyState title="NO SIEGE IN PROGRESS" />
        )}
        {locked.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="hud-readout__label">LOCKED SYSTEMS</p>
            {locked.map((l) => (
              <form key={l.id} action={forceRestoreAction} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <input type="hidden" name="system" value={l.system} />
                <span>
                  {systemLabel(l.system)} — {formatDuration(l.lockedUntil!.getTime() - now.getTime())} LEFT
                </span>
                <button type="submit" className="term-button term-button--sm">
                  [FORCE RESTORE]
                </button>
              </form>
            ))}
          </div>
        )}
      </HudPanel>

      <HudPanel code="05" title="EARLY ACCESS TESTERS" status={`${testers.length} TESTER${testers.length === 1 ? "" : "S"}`}>
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug mb-3">
          While the mode is EARLY ACCESS, only these members see the siege. Add RAISA testers so
          someone can defend.
        </p>
        {testers.length === 0 ? (
          <EmptyState title="NO TESTERS" />
        ) : (
          <ul className="text-sm space-y-1 mb-3">
            {testers.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {t.displayName ?? t.email}
                  {t.department && (
                    <span className="text-xs text-[var(--term-fg-dim)]"> — {t.department}</span>
                  )}
                </span>
                <form action={setEarlyAccessAction}>
                  <input type="hidden" name="userId" value={t.id} />
                  <input type="hidden" name="on" value="false" />
                  <button type="submit" className="term-button term-button--sm term-button--ghost">
                    [REMOVE]
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        {candidates.length > 0 && (
          <form action={setEarlyAccessAction} className="flex flex-wrap gap-2 items-end">
            <input type="hidden" name="on" value="true" />
            <label className="text-sm flex-1 min-w-[12rem]">
              <span className="hud-readout__label block mb-1">ADD TESTER</span>
              <select name="userId" className="term-input w-full" required defaultValue="">
                <option value="" disabled>
                  — SELECT MEMBER —
                </option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="term-button term-button--sm">
              [ADD]
            </button>
          </form>
        )}
      </HudPanel>

      <HudPanel code="06" title="CHAOS INSURGENCY ACCOUNTS" status={`${ciAccounts.length} ON FILE`}>
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug mb-3">
          RANK: an OPERATIVE fights in sieges. A SQUADRON LEADER can also host one — start it with a
          launch code — but cannot make codes. DELTA COMMAND can host and generate ENLIST and
          LAUNCH codes from the /insurgency portal.
        </p>
        {ciAccounts.length === 0 ? (
          <EmptyState title="NO CI ACCOUNTS" />
        ) : (
          <ul className="text-sm space-y-2">
            {ciAccounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {a.displayName}{" "}
                  <span className="text-xs text-[var(--term-fg-dim)]">
                    {a.email} · {a.createdAt.toISOString().slice(0, 10)}
                    {a.suspended && " · SUSPENDED"}
                  </span>
                </span>
                <span className="flex flex-wrap gap-2">
                  <form action={setCiRankAction} className="flex gap-1">
                    <input type="hidden" name="userId" value={a.id} />
                    <select
                      name="rank"
                      className="term-input"
                      defaultValue={ciRankOf(a)}
                      aria-label={`Rank for ${a.displayName ?? a.email}`}
                    >
                      {CI_RANKS.map((r) => (
                        <option key={r} value={r}>
                          {CI_RANK_LABELS[r]}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="term-button term-button--sm">
                      [SET]
                    </button>
                  </form>
                  <form action={setCiSuspendedAction}>
                    <input type="hidden" name="userId" value={a.id} />
                    <input type="hidden" name="suspend" value={String(!a.suspended)} />
                    <button type="submit" className="term-button term-button--sm">
                      {a.suspended ? "[REINSTATE]" : "[SUSPEND]"}
                    </button>
                  </form>
                  <form action={deleteCiAccountAction}>
                    <input type="hidden" name="userId" value={a.id} />
                    <button
                      type="submit"
                      className="term-button term-button--sm"
                      style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
                    >
                      [DELETE]
                    </button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}
      </HudPanel>

      <HudPanel code="07" title="SIEGE HISTORY" status={`${sieges.length} ON FILE`}>
        {sieges.length === 0 ? (
          <EmptyState title="NO SIEGES ON FILE" />
        ) : (
          <ul className="text-sm space-y-1">
            {sieges.map((s) => {
              const fallen = s.systems.filter((x) => x.fallenAt).map((x) => systemLabel(x.system));
              return (
                <li key={s.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {s.startedAt.toISOString().slice(0, 16).replace("T", " ")} — {s.launchedByName}
                  </span>
                  <span className="text-[var(--term-fg-dim)]">
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
