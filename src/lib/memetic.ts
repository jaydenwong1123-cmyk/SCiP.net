import type { SiteConfig } from "@/lib/site-config";

// MEMETIC AGENT — the cognitohazard the overseer can pin to one member's
// screen for a fixed span.
//
// This module is the single source of truth for what an exposure IS: which
// visuals exist, how fast they may flash, and how long they may run. The
// firing action, the polling endpoint and the overlay all resolve through the
// same catalogue, so a slug that isn't in it here cannot render anywhere.
//
// FAIL CLOSED is the rule throughout. Every read of a stored exposure runs
// through activeMemetic(), which discards anything unrecognised, expired or
// half-written. A blank full-screen overlay that will not go away is a worse
// outcome than an exposure that quietly doesn't fire.

export type MemeticAgent = {
  slug: string;
  /** Designation shown in the console and stamped across the overlay. */
  label: string;
  /** One line of flavour for the console's picker. */
  blurb: string;
  /** Public path to the plate. */
  src: string;
};

export const MEMETIC_AGENTS: MemeticAgent[] = [
  {
    slug: "abyss",
    label: "SCiP-2521-A // ABYSS",
    blurb: "Ocular cascade. Deep-field whorls, cold spectrum, arterial bleed.",
    src: "/memetic/abyss.svg",
  },
  {
    slug: "coil",
    label: "SCiP-2521-B // COIL",
    blurb: "Helical fibre. Monochrome, maximum contrast, no colour anchor.",
    src: "/memetic/coil.svg",
  },
  {
    slug: "pyre",
    label: "SCiP-2521-C // PYRE",
    blurb: "Vascular bloom. Warm spectrum, dense clustering, organic edges.",
    src: "/memetic/pyre.svg",
  },
];

export function findAgent(slug: string): MemeticAgent | null {
  return MEMETIC_AGENTS.find((a) => a.slug === slug) ?? null;
}

export type MemeticCadence = {
  slug: string;
  label: string;
  /** Milliseconds the plate is held, then the same again dark. */
  periodMs: number;
};

// PHOTOSENSITIVITY. The fastest cadence here completes three light-to-dark
// transitions per second, which is the ceiling the general flash guidance
// draws (WCAG 2.3.1) — deliberately the floor of the range rather than a knob
// that can be turned past it. A faster strobe is not offered because it is the
// one setting on this page that could hurt the person on the other end, and
// "the overseer chose it" is not a defence for that.
export const MEMETIC_CADENCES: MemeticCadence[] = [
  { slug: "pulse", label: "PULSE — 1 Hz", periodMs: 500 },
  { slug: "cycle", label: "CYCLE — 2 Hz", periodMs: 250 },
  { slug: "burst", label: "BURST — 3 Hz (MAX)", periodMs: 167 },
];

export function findCadence(slug: string): MemeticCadence | null {
  return MEMETIC_CADENCES.find((c) => c.slug === slug) ?? null;
}

export const MIN_EXPOSURE_SECONDS = 1;
// Four hours. Long enough for "however long I want" to mean it, short enough
// that a forgotten exposure is not permanent — and the recall control clears it
// instantly regardless.
export const MAX_EXPOSURE_SECONDS = 4 * 60 * 60;

export const EXPOSURE_PRESETS = [3, 10, 30, 60, 300] as const;

/** Clamps a submitted duration into range. NaN and junk read as the minimum. */
export function clampExposureSeconds(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return MIN_EXPOSURE_SECONDS;
  return Math.min(MAX_EXPOSURE_SECONDS, Math.max(MIN_EXPOSURE_SECONDS, n));
}

export type ActiveExposure = {
  targetId: string;
  agent: MemeticAgent;
  cadence: MemeticCadence;
  /** Epoch ms. The client counts down to this itself. */
  endsAt: number;
  issuedById: string | null;
};

/**
 * Reads the exposure recorded on the site config, or null if there isn't a
 * live, well-formed one right now.
 *
 * Every field must resolve: a target, a known agent, a known cadence and an
 * end still in the future. A row that is missing any of them is treated as no
 * exposure rather than being patched up with defaults — see the fail-closed
 * note at the top.
 */
export function activeMemetic(cfg: SiteConfig): ActiveExposure | null {
  const { memeticTargetId, memeticEndsAt } = cfg;
  if (!memeticTargetId || !memeticEndsAt) return null;
  if (memeticEndsAt.getTime() <= Date.now()) return null;

  const agent = findAgent(cfg.memeticAgent);
  const cadence = findCadence(cfg.memeticCadence);
  if (!agent || !cadence) return null;

  return {
    targetId: memeticTargetId,
    agent,
    cadence,
    endsAt: memeticEndsAt.getTime(),
    issuedById: cfg.memeticIssuedById,
  };
}

/** The exposure aimed at this viewer specifically, or null. */
export function memeticFor(
  cfg: SiteConfig,
  viewerId: string | null | undefined
): ActiveExposure | null {
  if (!viewerId) return null;
  const live = activeMemetic(cfg);
  return live && live.targetId === viewerId ? live : null;
}

export const CLEAR_MEMETIC = {
  memeticTargetId: null,
  memeticAgent: "",
  memeticCadence: "",
  memeticEndsAt: null,
  memeticIssuedById: null,
} as const;

/** "45s" / "3m 20s" / "1h 05m" — used by the console readouts. */
export function formatExposure(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s === 0 ? `${m}m` : `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}
