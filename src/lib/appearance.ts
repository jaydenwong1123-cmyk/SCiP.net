// Appearance presets shared by the pre-paint init script (in the root layout)
// and the Settings page. Preferences are stored per-browser in localStorage.

export const THEME_STORAGE_KEY = "scip-theme";
export const FONT_STORAGE_KEY = "scip-font";

export const DEFAULT_THEME = "green";
export const DEFAULT_FONT = "courier";

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
    key: "crimson",
    label: "CRIMSON ALERT",
    vars: {
      "--term-bg": "#0a0202",
      "--term-fg": "#ff5555",
      "--term-fg-dim": "#a83232",
      "--term-fg-bright": "#ffb3b3",
      "--term-border": "#a83232",
      "--term-glow-rgb": "255,85,85",
    },
  },
  {
    key: "violet",
    label: "VIOLET SIGNAL",
    vars: {
      "--term-bg": "#07040a",
      "--term-fg": "#c08cff",
      "--term-fg-dim": "#7a4fb3",
      "--term-fg-bright": "#e6ccff",
      "--term-border": "#7a4fb3",
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

// Simple key->value maps consumed by the inline init script.
export const THEME_MAP: Record<string, ThemeVars> = Object.fromEntries(
  THEMES.map((t) => [t.key, t.vars])
);
export const FONT_MAP: Record<string, string> = Object.fromEntries(
  FONTS.map((f) => [f.key, f.stack])
);
