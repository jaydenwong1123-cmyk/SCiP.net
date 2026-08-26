"use client";

import { useActionState, useState } from "react";
import { issueToolsAction, setQuartermasterGradientAction } from "./actions";
import {
  TOOL_ORDER,
  TOOL_LABELS,
  TOOL_BRIEFS,
  MAX_UNUSED_TOOLS,
} from "@/lib/hack/tools";
import {
  normalizeHexColor,
  gradientCss,
  textColorOnGradient,
} from "@/lib/hex-color";

export type QuartermasterMember = {
  id: string;
  name: string;
  /** Unspent charges already in this member's kit. */
  held: number;
};

export type QuartermasterGradient = { from: string; to: string } | null;

// The stops the preview falls back to while a stop is blank or half-typed, so
// the swatch never collapses to nothing mid-edit.
const PREVIEW_FALLBACK = { from: "#1e8f3d", to: "#050705" };

/**
 * Issue intrusion tooling to a member, and set your own background while
 * you're at it.
 *
 * Owner/Co-Owner only — the page gates the panel and both actions re-check with
 * requireOwner(), which is the boundary that actually holds.
 *
 * The member is picked from a list, never typed: this hands out currency in a
 * live economy, and a free-text id field is how the wrong person gets it.
 */
export function Quartermaster({
  members,
  gradient,
}: {
  members: QuartermasterMember[];
  gradient: QuartermasterGradient;
}) {
  const [state, formAction, pending] = useActionState(issueToolsAction, null);
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState("any");

  const selected = members.find((m) => m.id === userId) ?? null;
  const room = selected ? Math.max(0, MAX_UNUSED_TOOLS - selected.held) : null;

  return (
    <div className="space-y-3">
      {members.length === 0 && (
        <p className="text-sm text-[var(--term-fg-dim)] p-1">
          ⚙ NO ELIGIBLE MEMBERS ON ROSTER — NOTHING TO ISSUE TO. THE SITE
          APPEARANCE CONTROLS BELOW STILL APPLY.
        </p>
      )}

      <form
        action={formAction}
        className={`space-y-3 p-1 ${members.length === 0 ? "hidden" : ""}`}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="hud-readout__label block mb-1">MEMBER</span>
            <select
              name="userId"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="term-input py-1 w-64"
            >
              <option value="">— SELECT —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.held}/{MAX_UNUSED_TOOLS})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="hud-readout__label block mb-1">TOOL</span>
            <select
              name="kind"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="term-input py-1 w-56"
            >
              <option value="any">ANY — RANDOM DRAW</option>
              {TOOL_ORDER.map((k) => (
                <option key={k} value={k}>
                  {TOOL_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm">
            <span className="hud-readout__label block mb-1">CHARGES</span>
            <input
              type="number"
              name="count"
              min={1}
              max={MAX_UNUSED_TOOLS}
              defaultValue={1}
              className="term-input py-1 w-24"
            />
          </label>
        </div>

        <p className="text-xs text-[var(--term-fg-dim)]">
          {kind === "any"
            ? "Drawn at random from the full kit, the same way a cleared run pays out."
            : TOOL_BRIEFS[kind as keyof typeof TOOL_BRIEFS]}
        </p>

        <label className="block text-sm">
          <span className="hud-readout__label block mb-1">
            NOTE (OPTIONAL — SHOWN TO THE MEMBER)
          </span>
          <input
            type="text"
            name="note"
            maxLength={200}
            placeholder="e.g. COMPENSATION FOR THE LAYER 4 OUTAGE"
            className="term-input py-1 w-full"
          />
        </label>

        {selected && (
          <p className="text-xs text-[var(--term-fg-dim)]">
            {selected.name} HOLDS {selected.held} OF {MAX_UNUSED_TOOLS} CHARGES —{" "}
            {room === 0 ? (
              <span className="text-[var(--term-amber)]">
                KIT FULL, NOTHING WILL LAND.
              </span>
            ) : (
              <span className="text-[var(--term-fg)]">ROOM FOR {room} MORE.</span>
            )}
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
          disabled={pending}
          className="term-button term-button--sm"
          style={{ borderColor: "var(--term-amber)", color: "var(--term-amber)" }}
        >
          {pending ? "ISSUING..." : "[ISSUE TOOLING]"}
        </button>
      </form>

      <GradientEditor gradient={gradient} />
    </div>
  );
}

/**
 * Paste two hex stops and recolour the background — for the member who set
 * it, and no one else.
 *
 * Unlike the Settings page's theme/font/density pickers this isn't a
 * per-browser localStorage preference: it is one value in SiteConfig, and the
 * root layout only renders it back on requests from whoever's id is stamped
 * as the setter (see app/layout.tsx, quartermasterSetById). The preview here
 * is computed with the same normalizeHexColor()/gradientCss() the server and
 * the layout use, so what is shown is what gets stored — a preview drawn by a
 * second, looser parser would happily show a gradient the server then rejects.
 *
 * `gradient` is null both when nothing is set and when someone ELSE currently
 * holds it — the caller (page.tsx) only passes it through for the matching
 * viewer, so this form never shows or silently overwrites another member's
 * saved colours.
 */
function GradientEditor({ gradient }: { gradient: QuartermasterGradient }) {
  const [state, formAction, pending] = useActionState(
    setQuartermasterGradientAction,
    null
  );
  const [from, setFrom] = useState(gradient?.from ?? "");
  const [to, setTo] = useState(gradient?.to ?? "");

  const fromOk = normalizeHexColor(from);
  const toOk = normalizeHexColor(to);
  const bothBlank = from.trim() === "" && to.trim() === "";
  const previewFrom = fromOk ?? PREVIEW_FALLBACK.from;
  const previewTo = toOk ?? PREVIEW_FALLBACK.to;
  // Unsaved edits against what's actually stored — Cancel only needs to show
  // up once there is something for it to discard.
  const isDirty = from !== (gradient?.from ?? "") || to !== (gradient?.to ?? "");

  return (
    <details className="term-row">
      <summary className="cursor-pointer text-xs text-[var(--term-fg-dim)]">
        YOUR APPEARANCE — CUSTOM GRADIENT
      </summary>

      <form action={formAction} className="space-y-3 pt-3">
        <p className="text-xs text-[var(--term-fg-dim)]">
          Paste two hex colours to paint your own background across every page
          on the site — visible only to you, on any device you sign in on.
          Three or six digits, with or without the{" "}
          <span className="hud-recid">#</span>. Clear both fields and save to
          remove it and restore the standard terminal background.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="hud-readout__label block mb-1">STOP 1</span>
            <input
              type="text"
              name="gradientFrom"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              maxLength={7}
              placeholder="#33FF66"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={from.trim() !== "" && !fromOk}
              className="term-input py-1 w-32"
            />
          </label>
          <label className="text-sm">
            <span className="hud-readout__label block mb-1">STOP 2</span>
            <input
              type="text"
              name="gradientTo"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              maxLength={7}
              placeholder="#050705"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={to.trim() !== "" && !toOk}
              className="term-input py-1 w-32"
            />
          </label>
          <div className="text-sm">
            <span className="hud-readout__label block mb-1">PREVIEW</span>
            <div
              className="h-9 w-48 border border-[var(--term-border)] flex items-center justify-center text-xs tracking-[0.15em]"
              style={{
                background: gradientCss(previewFrom, previewTo),
                color: textColorOnGradient(previewFrom, previewTo),
                // Dimmed while the pair is not yet a valid, savable gradient,
                // so the swatch never looks like a committed result.
                opacity: fromOk && toOk ? 1 : 0.45,
              }}
            >
              QUARTERMASTER
            </div>
          </div>
        </div>

        {!bothBlank && (!fromOk || !toOk) && (
          <p className="text-xs text-[var(--term-amber)]">
            {!fromOk && !toOk
              ? "NEITHER STOP IS A HEX COLOUR YET."
              : `STOP ${!fromOk ? "1" : "2"} IS NOT A HEX COLOUR YET.`}
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

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending || (!bothBlank && (!fromOk || !toOk))}
            className="term-button term-button--sm"
          >
            {pending
              ? "SAVING..."
              : bothBlank
                ? "[CLEAR GRADIENT]"
                : "[SAVE GRADIENT]"}
          </button>
          {isDirty && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setFrom(gradient?.from ?? "");
                setTo(gradient?.to ?? "");
              }}
              className="term-button term-button--sm term-button--ghost"
            >
              [CANCEL]
            </button>
          )}
        </div>
      </form>
    </details>
  );
}
