import Link from "next/link";
import { HudPanel, StationHead, Readout, EmptyState } from "@/components/hud";

// Shown wherever a station calls notFound().
//
// READ THE WORDING BEFORE CHANGING IT. Across this app notFound() is not only
// "this row is missing" — it is also the DENIAL path. /scp/[id],
// /incidents/[id], /counter-intel, /admin/conduct and the history pages all
// answer an uncleared viewer with notFound() rather than a 403, specifically so
// that probing an id cannot reveal whether the record exists. The attachments
// route does the same thing.
//
// That only holds if this page reads identically in both cases. "NO RECORD
// MATCHES THIS DESIGNATOR AT YOUR CLEARANCE" is true whether the record is
// absent or merely out of reach, and separates neither. Do not "improve" it
// into anything that distinguishes them — no "you do not have access", no
// "this file was deleted", no suggestion to request clearance for THIS record.
export default function StationNotFound() {
  return (
    <>
      <StationHead code="SYS-404" title="NO SUCH RECORD">
        <Readout label="STATUS" value="QUERY RETURNED NOTHING" tone="amber" />
      </StationHead>

      <HudPanel code="01" title="REGISTRY LOOKUP" status="NO MATCH">
        <div className="p-4">
          <EmptyState glyph="▨" title="NO RECORD MATCHES THIS DESIGNATOR AT YOUR CLEARANCE.">
            <p
              className="text-sm mt-2"
              style={{ color: "var(--term-fg-dim)" }}
            >
              CHECK THE DESIGNATOR AND TRY AGAIN, OR RETURN TO THE STATION
              BOARD.
            </p>
            <div className="flex flex-wrap gap-3 justify-center pt-4">
              <Link href="/menu" className="term-button">
                [STATION BOARD]
              </Link>
              <Link
                href="/tickets/new"
                className="term-button term-button--ghost"
              >
                [REQUEST ASSISTANCE]
              </Link>
            </div>
          </EmptyState>
        </div>
      </HudPanel>
    </>
  );
}
