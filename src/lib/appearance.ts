// Appearance presets shared by the pre-paint init script (in the root layout)
// and the Settings page. Preferences are stored per-browser in localStorage.

export const THEME_STORAGE_KEY = "scip-theme";
export const FONT_STORAGE_KEY = "scip-font";
export const DENSITY_STORAGE_KEY = "scip-density";

export const DEFAULT_THEME = "green";
export const DEFAULT_FONT = "courier";
export const DEFAULT_DENSITY = "normal";

export type ThemeVars = {
  "--term-bg": string;
  "--term-fg": string;
  "--term-fg-dim": string;
  "--term-fg-bright": string;
  "--term-border": string;
  "--term-glow-rgb": string;
};

export const THEMES: { key: string; label: string; vars: ThemeVars }[] = [
  {
    key: "green",
    label: "PHOSPHOR GREEN",
    vars: {
      "--term-bg": "#050705",
      "--term-fg": "#33ff66",
      "--term-fg-dim": "#1e8f3d",
      "--term-fg-bright": "#aaffc4",
      "--term-border": "#1e8f3d",
      "--term-glow-rgb": "51,255,102",
    },
  },
  {
    key: "amber",
    label: "AMBER CRT",
    vars: {
      "--term-bg": "#0a0700",
      "--term-fg": "#ffb000",
      "--term-fg-dim": "#a86f00",
      "--term-fg-bright": "#ffd27f",
      "--term-border": "#a86f00",
      "--term-glow-rgb": "255,176,0",
    },
  },
  {
    key: "ice",
    label: "ICE BLUE",
    vars: {
      "--term-bg": "#02060a",
      "--term-fg": "#66ccff",
      "--term-fg-dim": "#2b7fb3",
      "--term-fg-bright": "#c2ecff",
      "--term-border": "#2b7fb3",
      "--term-glow-rgb": "102,204,255",
    },
  },
  {
    // `--term-fg-dim` was #a83232, which is only 3.10:1 against this
    // background — below the 4.5:1 AA floor for the metadata text that uses
    // it throughout the app. #cc5555 measures 4.88:1.
    key: "crimson",
    label: "CRIMSON ALERT",
    vars: {
      "--term-bg": "#0a0202",
      "--term-fg": "#ff5555",
      "--term-fg-dim": "#cc5555",
      "--term-fg-bright": "#ffb3b3",
      "--term-border": "#cc5555",
      "--term-glow-rgb": "255,85,85",
    },
  },
  {
    // Same fix: #7a4fb3 measured 3.49:1, #9569cf measures 5.04:1.
    key: "violet",
    label: "VIOLET SIGNAL",
    vars: {
      "--term-bg": "#07040a",
      "--term-fg": "#c08cff",
      "--term-fg-dim": "#9569cf",
      "--term-fg-bright": "#e6ccff",
      "--term-border": "#9569cf",
      "--term-glow-rgb": "192,140,255",
    },
  },
  {
    key: "mono",
    label: "MONOCHROME",
    vars: {
      "--term-bg": "#060606",
      "--term-fg": "#e6e6e6",
      "--term-fg-dim": "#888888",
      "--term-fg-bright": "#ffffff",
      "--term-border": "#777777",
      "--term-glow-rgb": "230,230,230",
    },
  },
];

export const FONTS: { key: string; label: string; stack: string }[] = [
  { key: "courier", label: "COURIER", stack: '"Courier New", ui-monospace, monospace' },
  { key: "consolas", label: "CONSOLAS", stack: 'Consolas, "Courier New", monospace' },
  { key: "lucida", label: "LUCIDA CONSOLE", stack: '"Lucida Console", Monaco, monospace' },
  {
    key: "system",
    label: "SYSTEM MONO",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  { key: "sans", label: "SANS TERMINAL", stack: '"Segoe UI", system-ui, sans-serif' },
  { key: "serif", label: "ARCHIVE SERIF", stack: 'Georgia, "Times New Roman", serif' },
];

// Display density. Drives the spacing/type scale that panels, list rows, and
// the tab strip read from, so registry-style pages can be tightened without
// touching individual components.
export type DensityVars = {
  "--term-pad": string;
  "--term-pad-sm": string;
  "--term-gap": string;
  "--term-row-y": string;
  "--term-size": string;
  "--term-line": string;
};

export const DENSITIES: {
  key: string;
  label: string;
  hint: string;
  vars: DensityVars;
}[] = [
  {
    key: "compact",
    label: "COMPACT",
    hint: "Maximum rows on screen — for long registries",
    vars: {
      "--term-pad": "0.6rem",
      "--term-pad-sm": "0.45rem",
      "--term-gap": "0.5rem",
      "--term-row-y": "0.15rem",
      "--term-size": "0.875rem",
      "--term-line": "1.45",
    },
  },
  {
    key: "normal",
    label: "NORMAL",
    hint: "Balanced default",
    vars: {
      "--term-pad": "1rem",
      "--term-pad-sm": "0.75rem",
      "--term-gap": "0.75rem",
      "--term-row-y": "0.25rem",
      "--term-size": "1rem",
      "--term-line": "1.55",
    },
  },
  {
    key: "comfortable",
    label: "COMFORTABLE",
    hint: "Roomier spacing and larger text",
    vars: {
      "--term-pad": "1.4rem",
      "--term-pad-sm": "1rem",
      "--term-gap": "1.1rem",
      "--term-row-y": "0.45rem",
      "--term-size": "1.0625rem",
      "--term-line": "1.7",
    },
  },
];

// Simple key->value maps consumed by the inline init script.
export const THEME_MAP: Record<string, ThemeVars> = Object.fromEntries(
  THEMES.map((t) => [t.key, t.vars])
);
export const FONT_MAP: Record<string, string> = Object.fromEntries(
  FONTS.map((f) => [f.key, f.stack])
);
export const DENSITY_MAP: Record<string, DensityVars> = Object.fromEntries(
  DENSITIES.map((d) => [d.key, d.vars])
);
