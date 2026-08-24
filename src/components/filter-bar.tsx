import Link from "next/link";
import { MAX_QUERY_LENGTH } from "@/lib/filters";

// Registry filter furniture, shared by /scp, /incidents and /personnel.
//
// All server components. The segmented rows are plain links and the search box
// is a plain GET form, so every filter on every station works with JavaScript
// disabled and each filtered view is a real, linkable, back-button-able URL.
// That is worth more here than interactivity would be: "send me the Keter
// files at L-4" should be a link somebody can paste into a message.

export type FilterOption = {
  value: string;
  label: string;
  /** Optional swatch, used for classification and severity rows. */
  color?: string;
};

/**
 * One facet: a label and a segmented control of mutually exclusive options,
 * with an "ALL" reset at the head.
 */
export function FilterRow({
  label,
  options,
  active,
  hrefFor,
  allLabel = "ALL",
}: {
  label: string;
  options: FilterOption[];
  /** The currently selected value, or null for "ALL". */
  active: string | null;
  /** Builds the href for a value; null means the "ALL" reset. */
  hrefFor: (value: string | null) => string;
  allLabel?: string;
}) {
  const seg = (on: boolean) => `hud-seg${on ? " hud-seg--on" : ""}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="hud-readout__label w-14 shrink-0">{label}</span>
      <div className="hud-segmented">
        <Link href={hrefFor(null)} className={seg(!active)}>
          {allLabel}
        </Link>
        {options.map((option) => (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            className={seg(active === option.value)}
            style={{
              color:
                active === option.value && option.color
                  ? option.color
                  : undefined,
            }}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

/**
 * Free-text search across a station.
 *
 * A GET form, so submitting navigates to `?q=...` — no action, no client
 * state. `hidden` carries the other active facets through the submission,
 * which is the whole reason this cannot just be a bare input: without them,
 * searching would silently clear the class and level the member had chosen.
 */
export function FilterSearch({
  action,
  query,
  hidden = {},
  placeholder = "SEARCH TITLES...",
  label = "SEARCH",
}: {
  /** Station path the form submits to, e.g. "/scp". */
  action: string;
  /** Current query, so the box stays filled after a search. */
  query: string | null;
  /** Other active facets to preserve, as name → value. */
  hidden?: Record<string, string | null | undefined>;
  placeholder?: string;
  label?: string;
}) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-center gap-2">
      <label className="hud-readout__label w-14 shrink-0" htmlFor="filter-q">
        {label}
      </label>
      {Object.entries(hidden).map(([name, value]) =>
        value ? (
          <input key={name} type="hidden" name={name} value={value} />
        ) : null
      )}
      <input
        id="filter-q"
        type="search"
        name="q"
        defaultValue={query ?? ""}
        maxLength={MAX_QUERY_LENGTH}
        placeholder={placeholder}
        className="term-input flex-1 min-w-[12rem]"
        // The app rejects non-ASCII everywhere (lib/validation.ts); saying so
        // on the input itself avoids a search that silently matches nothing.
        pattern="[\x20-\x7E]*"
        title="ASCII characters only"
      />
      <button type="submit" className="term-button term-button--sm">
        [FIND]
      </button>
      {query && (
        <Link
          href={
            Object.entries(hidden).some(([, v]) => v)
              ? `${action}?${new URLSearchParams(
                  Object.entries(hidden).filter(([, v]) => v) as [
                    string,
                    string,
                  ][]
                ).toString()}`
              : action
          }
          className="term-link text-sm"
        >
          [CLEAR]
        </Link>
      )}
    </form>
  );
}
