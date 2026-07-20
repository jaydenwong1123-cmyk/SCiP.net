export const INFRACTION_SEVERITIES = ["MINOR", "MAJOR", "SEVERE"] as const;
export type InfractionSeverity = (typeof INFRACTION_SEVERITIES)[number];

export function isInfractionSeverity(value: string): value is InfractionSeverity {
  return (INFRACTION_SEVERITIES as readonly string[]).includes(value);
}

export const INFRACTION_SEVERITY_COLOR: Record<InfractionSeverity, string> = {
  MINOR: "var(--term-fg-dim)",
  MAJOR: "var(--term-amber)",
  SEVERE: "var(--term-red)",
};
