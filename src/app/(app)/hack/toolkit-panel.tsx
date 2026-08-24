"use client";

import { useActionState } from "react";
import { spendHackToolAction, type ToolActionState } from "./actions";
import type { PublicChallenge } from "@/lib/hack/engine";
import {
  TOOL_ORDER,
  TOOL_LABELS,
  TOOL_BRIEFS,
  TOOL_KINDS,
  MAX_UNUSED_TOOLS,
  TOOL_EARN_MIN_STAGE,
  type ToolInventory,
  type ToolKind,
} from "@/lib/hack/tools";

// The intruder's toolkit.
//
// Rendered in two places with different affordances, which is why `onApplied`
// is optional: on the idle terminal it is a read-only inventory (nothing can be
// spent without a live run), and inside RunConsole it is live, handing the
// redrawn challenge back to the console when RECOMPILE fires.
export function ToolkitPanel({
  inventory,
  live = false,
  onApplied,
}: {
  inventory: ToolInventory;
  /** True when a run is in progress and tools may actually be spent. */
  live?: boolean;
  /** Called with the redrawn challenge after a successful RECOMPILE. */
  onApplied?: (challenge: PublicChallenge | null, note: string) => void;
}) {
  const held = TOOL_ORDER.reduce((n, k) => n + inventory[k], 0);

  return (
    <div className="alert-panel space-y-2 text-sm">
      <div className="hud-recid">COUNTERMEASURE KIT</div>
      <h2
        className="text-sm text-[var(--term-fg-bright)]"
        style={{ letterSpacing: "0.16em" }}
      >
        SALVAGED TOOLING — {held}/{MAX_UNUSED_TOOLS} CHARGES
      </h2>

      {held === 0 ? (
        <p className="text-xs text-[var(--term-fg-dim)]">
          {"> "}NO CHARGES HELD. BREACH LAYER {TOOL_EARN_MIN_STAGE} OR DEEPER AND
          EXTRACT TO SALVAGE TOOLING. WINNING A COUNTER-INTRUSION PAYS THE SAME.
        </p>
      ) : (
        <div className="space-y-2">
          {TOOL_ORDER.filter((kind) => inventory[kind] > 0).map((kind) => (
            <ToolRow
              key={kind}
              kind={kind}
              count={inventory[kind]}
              live={live}
              onApplied={onApplied}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-[var(--term-fg-dim)]">
        {"> "}A CHARGE CHANGES THE ODDS, NEVER THE ANSWER. NOTHING HERE SOLVES A
        PUZZLE FOR YOU.
      </p>
    </div>
  );
}

function ToolRow({
  kind,
  count,
  live,
  onApplied,
}: {
  kind: ToolKind;
  count: number;
  live: boolean;
  onApplied?: (challenge: PublicChallenge | null, note: string) => void;
}) {
  const [state, formAction, pending] = useActionState<
    ToolActionState | null,
    FormData
  >(async (prev, formData) => {
    const result = await spendHackToolAction(prev, formData);
    if (result.ok && onApplied) {
      onApplied(
        result.kind === "challenge" ? result.challenge : null,
        result.note
      );
    }
    return result;
  }, null);

  // GHOST acts on a finished case, so it is the one tool that is usable from
  // the idle terminal — every other charge needs a round in flight.
  const usable = live || kind === TOOL_KINDS.ghost;

  return (
    <form action={formAction} className="space-y-1">
      <input type="hidden" name="kind" value={kind} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[var(--term-amber)]">
          {TOOL_LABELS[kind]}{" "}
          <span className="hud-recid">×{count}</span>
        </span>
        <button
          type="submit"
          disabled={pending || !usable}
          className="term-button term-button--sm"
          title={usable ? undefined : "REQUIRES AN ACTIVE INTRUSION"}
        >
          {pending ? "APPLYING..." : "[BURN CHARGE]"}
        </button>
      </div>
      <p className="text-xs text-[var(--term-fg-dim)]">{TOOL_BRIEFS[kind]}</p>
      {state && !state.ok && (
        <p className="text-xs text-[var(--term-red)]">{state.error}</p>
      )}
      {state?.ok && state.kind === "note" && (
        <p className="text-xs text-[var(--term-fg-bright)]">{state.note}</p>
      )}
    </form>
  );
}
