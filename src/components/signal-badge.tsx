import { classificationColor } from "@/lib/classification";
import { severityColor } from "@/lib/incident";
import {
  INFRACTION_SEVERITIES,
  INFRACTION_SEVERITY_COLOR,
  type InfractionSeverity,
} from "@/lib/infractions";

// Shared badge for SCP object class and incident severity, so classification
// reads identically in list rows, detail headers, and history views.
//
// Each level pairs its color with a distinct glyph. Color alone must not carry
// the meaning (WCAG 1.4.1) — a red/green colorblind viewer, or anyone using
// the MONOCHROME theme, still gets the level from the glyph and the label.

const CLASSIFICATION_GLYPHS: Record<string, string> = {
  Safe: "○",
  Euclid: "◐",
  Keter: "●",
};

const SEVERITY_GLYPHS: Record<string, string> = {
  Minor: "○",
  Moderate: "◔",
  Major: "◑",
  Critical: "◕",
  "Containment Breach": "●",
};

function Badge({
  color,
  glyph,
  label,
  size,
}: {
  color: string;
  glyph: string;
  label: string;
  size?: "lg";
}) {
  return (
    <span
      className={`sig-badge${size === "lg" ? " sig-badge--lg" : ""}`}
      style={{ ["--sig" as string]: color }}
    >
      <span className="sig-badge__glyph" aria-hidden>
        {glyph}
      </span>
      {label.toUpperCase()}
    </span>
  );
}

export function ClassificationBadge({
  classification,
  size,
}: {
  classification: string;
  size?: "lg";
}) {
  return (
    <Badge
      color={classificationColor(classification)}
      glyph={CLASSIFICATION_GLYPHS[classification] ?? "◇"}
      label={classification}
      size={size}
    />
  );
}

export function SeverityBadge({
  severity,
  size,
}: {
  severity: string;
  size?: "lg";
}) {
  return (
    <Badge
      color={severityColor(severity)}
      glyph={SEVERITY_GLYPHS[severity] ?? "◇"}
      label={severity}
      size={size}
    />
  );
}

// Bare dot for dense list rows. Always paired with visible text elsewhere in
// the row, so it is decorative and hidden from assistive tech.
export function SignalDot({ color }: { color: string }) {
  return <span className="sig-dot" style={{ ["--sig" as string]: color }} aria-hidden />;
}

// Infraction severity as a four-segment meter. Rank is encoded in the number
// of filled segments as well as the colour, so it survives MONOCHROME and
// colourblind viewing the same way the glyph badges above do. Always rendered
// beside the severity's text label, never on its own.
export function SeverityMeter({ severity }: { severity: InfractionSeverity }) {
  const level = INFRACTION_SEVERITIES.indexOf(severity) + 1;
  const color = INFRACTION_SEVERITY_COLOR[severity] ?? "var(--term-fg-dim)";
  return (
    <span className="sig-meter" style={{ ["--sig" as string]: color }} aria-hidden>
      {INFRACTION_SEVERITIES.map((_, i) => (
        <span
          key={i}
          className={`sig-meter__seg${i < level ? " sig-meter__seg--on" : ""}`}
        />
      ))}
    </span>
  );
}
