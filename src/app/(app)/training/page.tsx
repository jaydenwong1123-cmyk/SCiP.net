import { notFound } from "next/navigation";
import { requireUser, hasHelperPowers } from "@/lib/session";
import { drillRoster, DRILL_BANDS, drillBandLabel } from "@/lib/hack/drills";
import { StationHead, HudPanel, Readout, TickRule } from "@/components/hud";
import { DrillConsole } from "./drill-console";

// The training range.
//
// HELPER AND ABOVE. Helper is the lowest role on the site and holds no power
// over another member, which is exactly why this station is safe at that tier:
// a drill issues no clearance, moves no ladder position, spends no cooldown and
// writes no conduct record. The only thing it can do is show someone a puzzle.
// See the HackDrill comment in schema.prisma for why it does not — and must
// not — share a table with a live intrusion round.
//
// requireStaff() would be the wrong guard here: it is one tier too high and
// would lock out the people who actually work the ticket queue these puzzles
// generate.

export default async function TrainingRangePage() {
  const user = await requireUser();
  if (!hasHelperPowers(user)) notFound();

  const roster = drillRoster();

  return (
    <>
      <StationHead code="TRN" title="TRAINING RANGE">
        <Readout label="Drills" value={roster.length} />
        <Readout label="Difficulties" value={DRILL_BANDS.length} small />
        <Readout label="Stakes" value="NONE" tone="dim" small />
      </StationHead>

      <HudPanel code="01" title="WHAT THIS IS" status="SIMULATION">
        <p className="text-sm leading-snug">
          Every countermeasure puzzle on this site, on demand. Pick the drill and
          pick the difficulty — the live terminal deals both at random and never
          twice in a session, which is correct for an intrusion and useless for
          anyone who has to answer a question about one.
        </p>
        <p className="text-xs text-[var(--term-fg-dim)] leading-snug mt-2">
          NOTHING HERE IS CONNECTED TO A LIVE SYSTEM. A drill grants no
          clearance, costs no cooldown, cannot be failed, and is never recorded
          against you. Answer keys are shown once a drill is graded. Re-roll as
          often as you like.
        </p>
      </HudPanel>

      <HudPanel
        code="02"
        title="DRILL SELECT"
        status={`${DRILL_BANDS.map(drillBandLabel).join(" / ")}`}
      >
        <TickRule className="mb-3" />
        <DrillConsole roster={roster} />
      </HudPanel>
    </>
  );
}
