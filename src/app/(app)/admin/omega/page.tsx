import Link from "next/link";
import { requireRootOwner } from "@/lib/session";
import { getSiteConfig } from "@/lib/site-config";
import { armState, OMEGA_OPS, ARM_DELAY_MS } from "@/lib/omega";
import { StationHead, HudPanel, Readout, TickRule } from "@/components/hud";
import { OmegaConsole } from "./omega-console";
import { RestoreConsole } from "./restore-console";

// Live arming state and shutdown posture; never prerendered.
export const dynamic = "force-dynamic";

// OMEGA AUTHORITY.
//
// A route of its own rather than a panel on /admin: that page is requireStaff()
// gated, so a block inside it would be one bad conditional away from being
// visible to a co-owner. Here the URL itself refuses everyone but the seeded
// owner, and requireRootOwner also enforces the SENTINEL challenge.
//
// Not registered in lib/sections.ts, so it appears in no navigation for anyone.
export default async function OmegaPage() {
  await requireRootOwner();

  const cfg = await getSiteConfig();
  const state = armState(cfg);
  const armed = state.armed
    ? { op: state.op, readyAt: state.readyAt, expiresAt: state.expiresAt }
    : null;

  const keyConfigured = (process.env.OMEGA_KEY ?? "").trim().length > 0;

  return (
    <>
      <StationHead code="OMG // OMEGA AUTHORITY" title="TERMINAL AUTHORITY">
        <Link href="/admin" className="term-link text-sm">
          [RETURN TO ADMINISTRATION]
        </Link>
      </StationHead>

      <HudPanel code="00" title="STANDING ORDER" variant="alert" status="EYES ONLY">
        <div className="alert-stripe" aria-hidden />
        <div className="hud-readout-bank">
          <Readout
            label="NETWORK"
            value={cfg.shutdownMode ? "TERMINATED" : "OPERATIONAL"}
            tone={cfg.shutdownMode ? "red" : "fg"}
          />
          <Readout
            label="OMEGA KEY"
            value={keyConfigured ? "PRESENT" : "ABSENT"}
            tone={keyConfigured ? "fg" : "red"}
          />
          <Readout
            label="ARMED"
            value={armed ? OMEGA_OPS[armed.op].label : "NONE"}
            tone={armed ? "red" : "dim"}
          />
          <Readout
            label="HOLD"
            value={`${Math.round(ARM_DELAY_MS / 1000)}s`}
            tone="dim"
          />
        </div>
        <TickRule className="my-3" />
        <p className="text-sm">
          THESE CONTROLS ARE RESTRICTED TO THE OVERSEER OF RECORD. THEY ARE
          VISIBLE TO NO OTHER ACCOUNT AT ANY CLEARANCE, INCLUDING CO-OWNER.
          EVERY ATTEMPT — SUCCESSFUL OR NOT — IS RECORDED IN THE ACCESS LOG.
        </p>
        {!keyConfigured && (
          <p className="text-sm text-[var(--term-red)]">
            OMEGA KEY IS NOT CONFIGURED IN THIS ENVIRONMENT. BOTH OPERATIONS
            WILL REFUSE UNTIL IT IS SET.
          </p>
        )}
      </HudPanel>

      {/* Placed ABOVE both destructive panels on purpose: the last thing the
          overseer should pass on the way to the purge button is the export
          button. */}
      <HudPanel
        code="01"
        title="NETWORK EXPORT"
        variant="secure"
        status="RECOVERY"
      >
        <div className="p-4 space-y-3">
          <p className="text-sm">
            DOWNLOAD THE ENTIRE NETWORK AS A SINGLE ARCHIVE — EVERY MEMBER,
            FILE, INCIDENT, MESSAGE, CASE AND LOG ENTRY. THIS IS THE ONLY
            RECOVERY PATH THAT EXISTS FOR A DATA PURGE.
          </p>
          <p className="text-sm text-[var(--term-amber)]">
            ⚠ THE EXPORTED ARCHIVE CONTAINS CREDENTIAL HASHES, INVITE CODES AND
            EVERY PRIVATE TRANSMISSION ON THE NETWORK. IT IS AS SENSITIVE AS THE
            DATABASE ITSELF. THE EXPORT IS RECORDED IN THE ACCESS LOG.
          </p>
          <TickRule />
          <div className="flex flex-wrap gap-3">
            {/* Plain anchors, not next/link: these are file downloads, and a
                client-side navigation would try to render JSON as a page. */}
            <a
              href="/admin/omega/backup"
              className="term-button"
              download
            >
              [EXPORT RECORDS]
            </a>
            <a
              href="/admin/omega/backup?attachments=1"
              className="term-button term-button--ghost"
              download
            >
              [EXPORT RECORDS + FILES]
            </a>
          </div>
          <p className="text-sm text-[var(--term-fg-dim)]">
            ATTACHMENT BYTES ARE HELD IN THE DATABASE, SO THE SECOND OPTION MAY
            BE VERY LARGE AND CAN TIME OUT ON A BIG NETWORK. FOR A COMPLETE
            OFFLINE ARCHIVE RUN{" "}
            <span className="text-[var(--term-fg)]">npm run db:backup</span>{" "}
            AGAINST THE PRODUCTION DATABASE INSTEAD.
          </p>
        </div>
      </HudPanel>

      {cfg.shutdownMode ? (
        <HudPanel
          code="02"
          title="SITE RESTORATION"
          variant="secure"
          status="NETWORK DARK"
        >
          <RestoreConsole />
        </HudPanel>
      ) : (
        <HudPanel
          code="02"
          title={OMEGA_OPS.terminate.label}
          variant="alert"
          status={armed?.op === "terminate" ? "ARMED" : "SAFE"}
        >
          <OmegaConsole
            op="terminate"
            label={OMEGA_OPS.terminate.label}
            phrase={OMEGA_OPS.terminate.phrase}
            blurb={OMEGA_OPS.terminate.blurb}
            irreversible={OMEGA_OPS.terminate.irreversible}
            armed={armed}
          />
        </HudPanel>
      )}

      <HudPanel
        code="03"
        title={OMEGA_OPS.purge.label}
        variant="alert"
        status={armed?.op === "purge" ? "ARMED" : "SAFE"}
      >
        <OmegaConsole
          op="purge"
          label={OMEGA_OPS.purge.label}
          phrase={OMEGA_OPS.purge.phrase}
          blurb={OMEGA_OPS.purge.blurb}
          irreversible={OMEGA_OPS.purge.irreversible}
          armed={armed}
        />
      </HudPanel>
    </>
  );
}
