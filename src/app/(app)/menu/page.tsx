import Link from "next/link";
import { requireUser } from "@/lib/session";
import { clearanceDisplay } from "@/lib/clearance";
import { getActiveHackGrant } from "@/lib/hack/grant";
import { resolveGates } from "@/lib/sections-access";
import { getStationCounts } from "@/lib/station-counts";
import {
  GROUP_LABELS,
  GROUP_ORDER,
  badgeCount,
  visibleSections,
  type Section,
} from "@/lib/sections";
import { StationHead, Readout, Lamp, HudBanner } from "@/components/hud";

export default async function MenuPage() {
  const user = await requireUser();
  const gates = resolveGates(user);

  // getStationCounts is request-cached and was already resolved by the app
  // layout for the command rail, so this costs nothing.
  const [counts, activeGrant] = await Promise.all([
    getStationCounts(user),
    getActiveHackGrant(user.id),
  ]);

  const sections = visibleSections(gates);
  const alerts =
    (counts.pendingRequests ?? 0) +
    (counts.openTickets ?? 0) +
    (counts.openCases ?? 0);

  return (
    <>
      <StationHead code="SCiP-220 // STATION BOARD" title="MAIN MENU">
        <Readout
          label="Clearance"
          value={clearanceDisplay(user.clearance, user.designation)}
        />
        <Readout label="Stations" value={sections.length} />
        <Readout
          label="Action Items"
          value={alerts}
          tone={alerts > 0 ? "amber" : "dim"}
        />
        <div className="hud-readout">
          <span className="hud-readout__label">Link</span>
          <Lamp state={activeGrant ? "alert" : "on"}>
            {activeGrant ? "COMPROMISED" : "SECURE"}
          </Lamp>
        </div>
      </StationHead>

      <p className="text-[var(--term-fg-dim)] text-xs">
        {"// SELECT A STATION TO CONTINUE"}
      </p>

      {GROUP_ORDER.map((group) => {
        const inGroup = sections.filter((s) => s.group === group);
        if (inGroup.length === 0) return null;
        return (
          <section key={group} className="flex flex-col gap-2">
            <HudBanner level="internal">▸ {GROUP_LABELS[group]}</HudBanner>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {inGroup.map((s) => (
                <StationTile
                  key={s.base}
                  section={s}
                  count={badgeCount(s, counts)}
                  // The unknown terminal is the one tile whose description
                  // changes with session state — an active illicit grant is
                  // exactly the thing its owner needs to see.
                  desc={
                    s.base === "/hack" && activeGrant
                      ? `ILLICIT ${clearanceDisplay(activeGrant.tier, null)} ACCESS ACTIVE`
                      : s.desc
                  }
                  {...stationState(s, !!activeGrant)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

// A station's lamp and its label, kept together so the colour and the word can
// never disagree — an "UNVERIFIED" node must not show a green light.
function stationState(
  section: Section,
  grantActive: boolean
): { lamp: "on" | "warn" | "alert" | "off"; lampText: string } {
  if (section.base === "/hack") {
    return grantActive
      ? { lamp: "alert", lampText: "ACTIVE" }
      : { lamp: "warn", lampText: "UNVERIFIED" };
  }
  if (section.accent === "red") return { lamp: "warn", lampText: "RESTRICTED" };
  if (section.gate) return { lamp: "warn", lampText: "RESTRICTED" };
  return { lamp: "on", lampText: "ONLINE" };
}

function StationTile({
  section,
  count,
  desc,
  lamp,
  lampText,
}: {
  section: Section;
  count: number;
  desc: string;
  lamp: "on" | "warn" | "alert" | "off";
  lampText: string;
}) {
  const accent =
    section.accent === "amber"
      ? " menu-tile--amber"
      : section.accent === "red"
        ? " menu-tile--red"
        : "";

  return (
    <Link href={section.base} className={`menu-tile term-panel${accent}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="hud-recid">[{section.code}]</span>
        <Lamp state={lamp}>{lampText}</Lamp>
      </div>

      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span
          className="text-sm sm:text-base text-[var(--term-fg-bright)]"
          style={{ letterSpacing: "0.12em" }}
        >
          {section.label}
        </span>
        {count > 0 && (
          <span
            className="clearance-chip text-[10px]"
            // The count is meaningless to a screen reader without the noun, so
            // the accessible name carries both.
            aria-label={`${count} ${section.badgeLabel ?? "new"}`}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-[var(--term-fg-dim)] leading-snug">{desc}</p>

      <div className="mt-3 text-xs text-[var(--term-fg-dim)] menu-tile__prompt">
        {"> ACCESS"} <span className="menu-tile__caret">_</span>
      </div>
    </Link>
  );
}
