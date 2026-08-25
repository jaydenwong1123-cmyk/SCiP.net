import type React from "react";

// ---------------------------------------------------------------------------
// Ops-console primitives
//
// The console's repeated furniture, so screens compose it rather than
// rebuilding it out of Tailwind utilities each time. All styling lives in
// globals.css under the .hud-* namespace; these are thin structural wrappers.
// ---------------------------------------------------------------------------

/**
 * Classification bar. Every screen is bracketed by one top and bottom — the
 * rule that nothing in the console floats unlabelled.
 */
export function HudBanner({
  level = "ts",
  children,
  className = "",
}: {
  level?: "ts" | "secret" | "internal" | "alert" | "alert-red";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`hud-banner hud-banner--${level} ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * Screen-level header: station designator, title, and right-aligned live
 * readouts. Replaces the `:: SECTION ::` heading that used to open every page.
 */
export function StationHead({
  code,
  title,
  children,
  className = "",
}: {
  code: string;
  title: React.ReactNode;
  /** Readouts, filters or actions, right-aligned. */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`hud-station-head ${className}`.trim()}>
      <div className="min-w-0">
        <span className="hud-station-head__code">{code}</span>
        <h1 className="hud-station-head__title">{title}</h1>
      </div>
      {children && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-2">{children}</div>
      )}
    </div>
  );
}

/**
 * A numbered station panel. `code` turns an anonymous card into something the
 * console can refer to.
 */
export function HudPanel({
  code,
  title,
  status,
  variant,
  children,
  className = "",
  collapsible = false,
  defaultOpen = true,
}: {
  code?: string;
  title?: React.ReactNode;
  /** Right-aligned state text in the panel head, e.g. "12 RECORDS". */
  status?: React.ReactNode;
  variant?: "primary" | "sub" | "alert" | "secure";
  children: React.ReactNode;
  className?: string;
  /** Renders the head as a click-to-toggle disclosure, body space collapsing when shut. */
  collapsible?: boolean;
  /** Only relevant when `collapsible` is set. */
  defaultOpen?: boolean;
}) {
  const variantClass = variant ? ` term-panel--${variant}` : "";
  const head = (code || title) && (
    <>
      {code && <span className="hud-panel-head__code">{code}</span>}
      {title && <span>{title}</span>}
      {status && <span className="hud-panel-head__status">{status}</span>}
      {collapsible && (
        <span className="hud-panel-head__chevron" aria-hidden>
          ▸
        </span>
      )}
    </>
  );

  if (collapsible) {
    return (
      <details
        className={`term-panel${variantClass} hud-panel--collapsible ${className}`.trim()}
        open={defaultOpen}
      >
        <summary className="hud-panel-head">{head}</summary>
        <div className="hud-panel-body">{children}</div>
      </details>
    );
  }

  return (
    <section className={`term-panel${variantClass} ${className}`.trim()}>
      {(code || title) && <div className="hud-panel-head">{head}</div>}
      {children}
    </section>
  );
}

/** Label-over-value telemetry pair. */
export function Readout({
  label,
  value,
  tone,
  small = false,
}: {
  label: string;
  value: React.ReactNode;
  /** Colour cue. Always accompanied by the label, never colour alone. */
  tone?: "fg" | "amber" | "red" | "dim";
  small?: boolean;
}) {
  const color =
    tone === "amber"
      ? "var(--term-amber)"
      : tone === "red"
        ? "var(--term-red)"
        : tone === "dim"
          ? "var(--term-fg-dim)"
          : undefined;
  return (
    <div className="hud-readout">
      <span className="hud-readout__label">{label}</span>
      <span
        className={`hud-readout__value${small ? " hud-readout__value--sm" : ""}`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

/** Status lamp: a filled dot plus its label. Colour never carries meaning alone. */
export function Lamp({
  state = "off",
  children,
}: {
  state?: "on" | "warn" | "alert" | "off";
  children: React.ReactNode;
}) {
  return <span className={`hud-lamp hud-lamp--${state}`}>{children}</span>;
}

/** Horizontal rule with ruler ticks, for dividing a panel's sections. */
export function TickRule({ className = "" }: { className?: string }) {
  return <div className={`hud-tick-rule ${className}`.trim()} aria-hidden />;
}

/** Monospace record identifier (IR-0091, CASE-4471). */
export function RecordId({ children }: { children: React.ReactNode }) {
  return <span className="hud-recid">{children}</span>;
}

/** Empty state. `NO RECORDS ON FILE` framed as a hatched, dashed placeholder. */
export function EmptyState({
  glyph = "▤",
  title,
  children,
}: {
  glyph?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__glyph" aria-hidden>
        {glyph}
      </span>
      <p className="empty-state__title">{title}</p>
      {children}
    </div>
  );
}

/** Table wrapper: wide data scrolls inside its own box, never the page. */
export function HudTable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="hud-table-wrap">
      <table className={`hud-table ${className}`.trim()}>{children}</table>
    </div>
  );
}
