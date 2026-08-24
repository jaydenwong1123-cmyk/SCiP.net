// Shared query-string handling for the registry filters.
//
// Every filtered station (/scp, /incidents, /personnel) needs the same three
// things: build a link that changes ONE facet while preserving the others,
// validate an incoming param against a known set, and normalize a free-text
// query. That logic was previously written out inside /scp's page as local
// `qs()` and `seg()` helpers; it lives here now so the other stations reuse it
// rather than growing their own subtly different copies.
//
// Kept free of server-only imports so a Client Component can import it too.

export type FilterState = Record<string, string | null | undefined>;

/**
 * A link to the same station with `change` applied on top of `current`.
 *
 * Pass `null` for a facet to clear it. Empty and null values are dropped
 * entirely rather than serialized as `?class=`, so the "ALL" link on every row
 * is a clean URL and the browser's back button behaves.
 */
export function filterHref(
  base: string,
  current: FilterState,
  change: FilterState = {}
): string {
  const merged = { ...current, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** True when any facet is set — drives the "CLEAR FILTERS" affordance. */
export function hasActiveFilters(current: FilterState): boolean {
  return Object.values(current).some((v) => Boolean(v));
}

/**
 * Accept a param only if it is one of `allowed`, else null.
 *
 * These values reach a Prisma `where`, so an unrecognized one must become null
 * rather than being passed through — not because Prisma would be injectable,
 * but because a typo'd facet should show the unfiltered station rather than an
 * empty one the member cannot explain.
 */
export function pickOption(
  value: string | undefined,
  allowed: readonly string[]
): string | null {
  return value && allowed.includes(value) ? value : null;
}

/**
 * Accept an integer param inside [min, max], else null.
 *
 * Digits only, checked BEFORE parsing. parseInt is happy to read "2.5" as 2 and
 * "1e3" as 1, which would silently turn a malformed facet into a valid-looking
 * filter rather than falling back to the unfiltered station. Strict here for the
 * same reason pickOption is strict: an unrecognised facet should show
 * everything, not something.
 */
export function pickRank(
  value: string | undefined,
  min: number,
  max: number
): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

// Free-text queries are capped and trimmed. Short of the cap a `contains`
// scan over a few hundred rows is nothing; the cap exists so the param cannot
// be used to push a pathological string into the query planner.
export const MAX_QUERY_LENGTH = 80;

/** Normalize a free-text search param. Returns null for anything unusable. */
export function pickQuery(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * A Prisma `contains` filter for SQLite.
 *
 * No `mode: "insensitive"` — SQLite does not support it through Prisma, and it
 * is not needed: SQLite's LIKE is already case-insensitive across ASCII, and
 * lib/validation.ts rejects non-ASCII input everywhere in the app, so ASCII is
 * the whole domain.
 */
export function containsFilter(query: string) {
  return { contains: query };
}
