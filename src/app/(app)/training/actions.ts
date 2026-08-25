"use server";

import { requireUser, hasHelperPowers } from "@/lib/session";
import { containsNonAscii, NON_ASCII_ERROR } from "@/lib/validation";
import { issueDrill, gradeDrill, pruneDrills } from "@/lib/hack/drill-store";
import type { PublicDrill, DrillResult } from "@/lib/hack/drills";

// Both actions re-check the gate rather than trusting that the station was
// visible. A server action runs its own request and never renders the layout
// that filtered the command rail, so the rail's decision carries no authority
// here — same reason /admin/conduct re-guards inside its actions.
//
// These take plain arguments rather than (prevState, FormData), unlike the
// admin consoles. Half the games build their answer by clicking — a mine
// survey, a daemon coordinate chain — so the answer lives in React state and
// never in a form field. Passing FormData would mean shadowing the answer into
// a hidden input that collides with the one AnswerLine already names "answer".
// The intrusion console has the same constraint and resolves it the same way.

const FORBIDDEN = "NOT CLEARED FOR THE TRAINING RANGE.";

export type StartDrillState =
  | { ok: true; drill: PublicDrill }
  | { ok: false; error: string };

export type SubmitDrillState =
  | { ok: true; result: DrillResult }
  | { ok: false; error: string };

export async function startDrillAction(
  game: string,
  band: number
): Promise<StartDrillState> {
  const user = await requireUser();
  if (!hasHelperPowers(user)) return { ok: false, error: FORBIDDEN };
  if (containsNonAscii(game)) return { ok: false, error: NON_ASCII_ERROR };

  const issued = await issueDrill(user.id, game, band);
  if (!issued.ok) return issued;

  await pruneDrills(user.id);
  return { ok: true, drill: issued.drill };
}

export async function submitDrillAction(
  nonce: string,
  answer: string
): Promise<SubmitDrillState> {
  const user = await requireUser();
  if (!hasHelperPowers(user)) return { ok: false, error: FORBIDDEN };
  if (containsNonAscii(answer)) return { ok: false, error: NON_ASCII_ERROR };

  return gradeDrill(user.id, nonce, answer);
}
