// SCP object classes with their signal colors.
export const CLASSIFICATIONS = [
  { name: "Safe", color: "#3fb950" }, // green
  { name: "Euclid", color: "#d29922" }, // yellow
  { name: "Keter", color: "#f85149" }, // red
] as const;

export const DEFAULT_CLASSIFICATION = "Safe";

export function classificationColor(name: string): string {
  return CLASSIFICATIONS.find((c) => c.name === name)?.color ?? "var(--term-fg-dim)";
}

export function isValidClassification(name: string): boolean {
  return CLASSIFICATIONS.some((c) => c.name === name);
}
