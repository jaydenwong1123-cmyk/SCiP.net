"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deployMemeticAction, recallMemeticAction } from "./actions";
import {
  MEMETIC_AGENTS,
  MEMETIC_CADENCES,
  EXPOSURE_PRESETS,
  MIN_EXPOSURE_SECONDS,
  MAX_EXPOSURE_SECONDS,
  clampExposureSeconds,
  formatExposure,
} from "@/lib/memetic";

export type MemeticTarget = { id: string; name: string; rank: string };

export type LiveExposure = {
  targetName: string;
  agentLabel: string;
  cadenceLabel: string;
  endsAt: number;
} | null;

/**
 * MEMETIC AGENT deployment.
 *
 * Pick a member, pick a plate, pick how long — the overlay goes up on their
 * screen within a poll and comes down on its own when the clock runs out, or
 * the moment RECALL is pressed.
 *
 * The member is chosen from a list and never typed, for the same reason the
 * quartermaster does it that way: this is aimed at a person, and a free-text id
 * field is how the wrong one gets hit. The server re-resolves the id regardless
 * — the select is a convenience, not the check.
 */
export function MemeticConsole({
  targets,
  live,
}: {
  targets: MemeticTarget[];
  live: LiveExposure;
}) {
  const [state, formAction, pending] = useActionState(deployMemeticAction, null);
  const [targetId, setTargetId] = useState("");
  const [agent, setAgent] = useState(MEMETIC_AGENTS[0]!.slug);
  const [cadence, setCadence] = useState(MEMETIC_CADENCES[0]!.slug);
  const [seconds, setSeconds] = useState("10");

  const chosenAgent = MEMETIC_AGENTS.find((a) => a.slug === agent)!;
  const parsed = Number(seconds);
  const secondsOk =
    Number.isFinite(parsed) &&
    parsed >= MIN_EXPOSURE_SECONDS &&
    parsed <= MAX_EXPOSURE_SECONDS;
  const selected = targets.find((t) => t.id === targetId) ?? null;

  return (
    <div className="space-y-3 p-1">
      {live ? (
        <LiveReadout live={live} />
      ) : (
        <p className="text-sm text-[var(--term-fg-dim)]">
          NO EXPOSURE IN PROGRESS. ONE MAY BE LIVE AT A TIME — DEPLOYING WHILE
          ANOTHER IS UP REPLACES IT.
        </p>
      )}

      {targets.length === 0 ? (
        <p className="text-sm text-[var(--term-fg-dim)]">
          NO OTHER MEMBERS ON ROSTER — NOTHING TO DEPLOY AGAINST.
        </p>
      ) : (
        <form action={formAction} className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="hud-readout__label block mb-1">TARGET</span>
              <select
                name="targetId"
                required
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="term-input py-1 w-64"
              >
                <option value="">— SELECT —</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} [{t.rank}]
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="hud-readout__label block mb-1">AGENT</span>
              <select
                name="agent"
                value={agent}
                onChange={(e) => setAgent(e.target.value)}
                className="term-input py-1 w-64"
              >
                {MEMETIC_AGENTS.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="hud-readout__label block mb-1">CADENCE</span>
              <select
                name="cadence"
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="term-input py-1 w-48"
              >
                {MEMETIC_CADENCES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="hud-readout__label block mb-1">
                DURATION (SECONDS)
              </span>
              <input
                type="number"
                name="seconds"
                min={MIN_EXPOSURE_SECONDS}
                max={MAX_EXPOSURE_SECONDS}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                aria-invalid={!secondsOk}
                className="term-input py-1 w-32"
              />
            </label>
            <div className="flex flex-wrap gap-2 pb-1">
              {EXPOSURE_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSeconds(String(p))}
                  className="term-button term-button--sm term-button--ghost"
                >
                  {formatExposure(p)}
                </button>
              ))}
            </div>
          </div>

          {/* The plate as it will actually be delivered, at the size the panel
              has room for. Shown rather than described: choosing between three
              cognitohazards from their designations alone is choosing blind. */}
          <div className="flex flex-wrap items-start gap-3">
            <div
              className="w-40 h-28 border border-[var(--term-border)] bg-black bg-cover bg-center shrink-0"
              style={{ backgroundImage: `url(${chosenAgent.src})` }}
              aria-hidden
            />
            <p className="text-xs text-[var(--term-fg-dim)] max-w-md">
              {chosenAgent.blurb}
              <br />
              <br />
              THE PLATE COVERS THE TARGET&apos;S ENTIRE VIEWPORT AND CANNOT BE
              DISMISSED FROM THEIR SIDE. IT ENDS ON ITS OWN WHEN THE DURATION
              LAPSES — EVEN IF THEIR CONNECTION DROPS — OR IMMEDIATELY ON
              RECALL.
            </p>
          </div>

          <p className="text-xs text-[var(--term-amber)]">
            ⚠ CADENCE IS CAPPED AT 3 Hz. FLASHING VISUALS CAN TRIGGER SEIZURES
            IN PHOTOSENSITIVE PEOPLE — DO NOT DEPLOY A LONG EXPOSURE AGAINST
            SOMEONE WHOSE SENSITIVITY YOU DO NOT KNOW.
          </p>

          {selected && (
            <p className="text-xs text-[var(--term-fg-dim)]">
              WILL EXPOSE{" "}
              <span className="text-[var(--term-fg)]">{selected.name}</span> FOR{" "}
              <span className="text-[var(--term-fg)]">
                {formatExposure(clampExposureSeconds(seconds))}
              </span>{" "}
              ON EVERY TERMINAL THEY ARE SIGNED IN ON.
            </p>
          )}

          {state?.error && (
            <p role="alert" className="text-sm text-[var(--term-red)]">
              {state.error}
            </p>
          )}
          {state?.ok && state.message && (
            <p className="text-sm text-[var(--term-fg-bright)]">{state.message}</p>
          )}

          <button
            type="submit"
            disabled={pending || !targetId || !secondsOk}
            className="term-button term-button--danger w-full"
          >
            {pending ? "DEPLOYING..." : "[DEPLOY MEMETIC AGENT]"}
          </button>
        </form>
      )}
    </div>
  );
}

/**
 * What is up right now, and the control that takes it down.
 *
 * Refreshes the server view once the exposure lapses so the panel does not go
 * on offering RECALL for something that already ended by itself.
 */
function LiveReadout({ live }: { live: NonNullable<LiveExposure> }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t > live.endsAt) router.refresh();
    }, 500);
    return () => clearInterval(id);
  }, [live.endsAt, router]);

  const remaining = Math.max(0, Math.ceil((live.endsAt - now) / 1000));

  return (
    <div className="space-y-2">
      <div className="hud-readout-bank">
        <div className="hud-readout">
          <span className="hud-readout__label">TARGET</span>
          <span className="hud-readout__value">{live.targetName}</span>
        </div>
        <div className="hud-readout">
          <span className="hud-readout__label">AGENT</span>
          <span className="hud-readout__value">{live.agentLabel}</span>
        </div>
        <div className="hud-readout">
          <span className="hud-readout__label">CADENCE</span>
          <span className="hud-readout__value">{live.cadenceLabel}</span>
        </div>
        <div className="hud-readout">
          <span className="hud-readout__label">REMAINING</span>
          <span
            className="hud-readout__value tabular-nums"
            style={{ color: "var(--term-red)" }}
          >
            {remaining}s
          </span>
        </div>
      </div>
      <form action={recallMemeticAction}>
        <button type="submit" className="term-button w-full">
          [RECALL AGENT]
        </button>
      </form>
    </div>
  );
}
