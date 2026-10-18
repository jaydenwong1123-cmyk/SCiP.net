import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { canAccessCounterIntel } from "@/lib/counter-intel";
import { ciModeOf, ciVisibleTo } from "@/lib/ci/access";
import { RAISA_HEAL, RESTORE_ONLINE_PCT, RESTORE_SOLVES } from "@/lib/ci/config";
import { recentSieges, siegeFeed, siegeScoreboard } from "@/lib/ci/siege-store";
import { StationHead, HudPanel, HudBanner, Readout, EmptyState } from "@/components/hud";
import { SiegeConsole } from "@/components/ci/siege-console";
import { abandonDefenseAction, issueDefenseAction, submitDefenseAction } from "./actions";

// RAISA's siege desk. Same gate as the counter-intrusion desk (the department
// string), plus siege visibility — which every RAISA officer has whenever the
// feature is on (early access or live). To everyone else the route does not
// exist.
export default async function SiegeDefensePage() {
  const user = await requireUser();
  const cfg = await getSiteConfig();
  if (!canAccessCounterIntel(user) || !ciVisibleTo(user, cfg)) notFound();

  const [feed, sieges] = await Promise.all([siegeFeed(true), recentSieges(1)]);
  const scoreSiege = feed?.active?.id ?? sieges[0]?.id ?? null;
  const scores = scoreSiege ? await siegeScoreboard(scoreSiege, "raisa") : [];

  return (
    <>
      <StationHead code="RAISA // SIEGE DEFENSE" title="PERIMETER">
        <Readout
          label="Status"
          value={feed?.active ? "UNDER ATTACK" : feed?.locked.length ? "DEGRADED" : "NOMINAL"}
          tone={feed?.active ? "red" : feed?.locked.length ? "amber" : "dim"}
        />
        <Readout label="Restore / solve" value={`+${RAISA_HEAL}`} small />
        <Link href="/counter-intel" className="term-link text-sm">
          [WATCH FLOOR]
        </Link>
      </StationHead>

      {ciModeOf(cfg) === "early" && (
        <HudBanner level="alert">EARLY ACCESS — VISIBLE TO RAISA AND TESTERS ONLY</HudBanner>
      )}

      <HudPanel code="01" title="SYSTEMS" status={feed?.active ? "ENGAGED" : "STANDBY"}>
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug mb-3">
          Chaos Insurgency drains a system with every puzzle they crack. Every puzzle you solve
          restores {RAISA_HEAL}. A system that hits zero goes dark for the whole network — push it
          back to {RESTORE_ONLINE_PCT}% while the siege is on to bring it back. After the siege,{" "}
          {RESTORE_SOLVES} restore puzzles clear a lock early.
        </p>
        <SiegeConsole
          side="raisa"
          initialFeed={feed}
          issue={issueDefenseAction}
          submit={submitDefenseAction}
          abandon={abandonDefenseAction}
        />
      </HudPanel>

      <HudPanel code="02" title="DEFENDERS" status={scores.length ? `${scores.length} ON DUTY` : "—"}>
        {scores.length === 0 ? (
          <EmptyState title="NO RESTORES LOGGED" />
        ) : (
          <ul className="text-sm space-y-1">
            {scores.map((s) => (
              <li key={s.name} className="flex justify-between gap-2">
                <span>{s.name}</span>
                <span className="text-[var(--term-fg-dim)]">
                  {s.solves} SOLVE{s.solves === 1 ? "" : "S"} · +{s.total}
                </span>
              </li>
            ))}
          </ul>
        )}
      </HudPanel>
    </>
  );
}
