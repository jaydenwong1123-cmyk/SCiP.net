// Chaos Insurgency command ranks. Client-safe.
//
//   operative        every new CI account; fights in a siege someone else hosts
//   squadron_leader  may HOST a siege — start one with a launch code — but
//                    cannot make codes
//   delta_command    everything a squadron leader can do, plus generating
//                    enlist and launch codes from the /insurgency portal
//
// The owner assigns any rank from /admin/insurgency. Delta Command may also
// promote an Operative to Squadron Leader, or demote one back, from the
// roster — never anyone's rank to or from Delta Command, and never their own.
// Ranks grant no
// power anywhere on the member network: a CI account is still walled off from
// it whatever its rank.

export const CI_RANKS = ["operative", "squadron_leader", "delta_command"] as const;
export type CiRank = (typeof CI_RANKS)[number];

export const CI_RANK_LABELS: Record<CiRank, string> = {
  operative: "OPERATIVE",
  squadron_leader: "SQUADRON LEADER",
  delta_command: "DELTA COMMAND",
};

export function isCiRank(value: string): value is CiRank {
  return (CI_RANKS as readonly string[]).includes(value);
}

// Anything unrecognised reads as operative, so a bad value can never grant
// launch or code authority.
export function ciRankOf(user: { ciRank?: string | null }): CiRank {
  return user.ciRank && isCiRank(user.ciRank) ? user.ciRank : "operative";
}

function atLeast(user: { ciRank?: string | null }, rank: CiRank): boolean {
  return CI_RANKS.indexOf(ciRankOf(user)) >= CI_RANKS.indexOf(rank);
}

/** Squadron Leader and above may start a siege. */
export function canHostSiege(user: { ciRank?: string | null }): boolean {
  return atLeast(user, "squadron_leader");
}

/** Only Delta Command may generate enlist and launch codes. */
export function canCreateCiCodes(user: { ciRank?: string | null }): boolean {
  return atLeast(user, "delta_command");
}

// Unspent codes one Delta Command may hold at a time, so the desk cannot be
// used to flood the code table.
export const MAX_LIVE_CODES_PER_COMMANDER = 10;

export const HOST_REFUSED = "ONLY A SQUADRON LEADER OR DELTA COMMAND CAN LAUNCH A SIEGE.";

// Ranks a Delta Command may hand out from the roster.
export const COMMAND_ASSIGNABLE_RANKS: readonly CiRank[] = ["operative", "squadron_leader"];

/** May this actor set the target's rank to `rank` from the CI portal? */
export function canCommandSetRank(
  actor: { id: string; ciRank?: string | null },
  target: { id: string; ciRank?: string | null },
  rank: string
): boolean {
  if (!canCreateCiCodes(actor)) return false;
  if (actor.id === target.id) return false;
  if (ciRankOf(target) === "delta_command") return false;
  return (COMMAND_ASSIGNABLE_RANKS as readonly string[]).includes(rank);
}
