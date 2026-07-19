// Incident severity levels with their signal colors.
export const SEVERITIES = [
  { name: "Minor", color: "#3fb950" }, // green
  { name: "Moderate", color: "#d29922" }, // amber
  { name: "Major", color: "#f0883e" }, // orange
  { name: "Critical", color: "#f85149" }, // red
  { name: "Containment Breach", color: "#ff3333" }, // bright red
] as const;

export const DEFAULT_SEVERITY = "Minor";

export function severityColor(name: string): string {
  return SEVERITIES.find((s) => s.name === name)?.color ?? "var(--term-fg-dim)";
}

export function isValidSeverity(name: string): boolean {
  return SEVERITIES.some((s) => s.name === name);
}
