"use client";

import { useEffect, useState } from "react";
import {
  THEMES,
  FONTS,
  THEME_MAP,
  FONT_MAP,
  THEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  DEFAULT_THEME,
  DEFAULT_FONT,
} from "@/lib/appearance";

function applyTheme(themeKey: string) {
  const vars = THEME_MAP[themeKey] ?? THEME_MAP[DEFAULT_THEME];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

function applyFont(fontKey: string) {
  const stack = FONT_MAP[fontKey] ?? FONT_MAP[DEFAULT_FONT];
  document.documentElement.style.setProperty("--term-font", stack);
}

export function SettingsForm() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [font, setFont] = useState(DEFAULT_FONT);

  // Load saved values on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME);
    setFont(localStorage.getItem(FONT_STORAGE_KEY) ?? DEFAULT_FONT);
  }, []);

  function chooseTheme(key: string) {
    setTheme(key);
    localStorage.setItem(THEME_STORAGE_KEY, key);
    applyTheme(key);
  }

  function chooseFont(key: string) {
    setFont(key);
    localStorage.setItem(FONT_STORAGE_KEY, key);
    applyFont(key);
  }

  function resetAll() {
    chooseTheme(DEFAULT_THEME);
    chooseFont(DEFAULT_FONT);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">DISPLAY COLOR SCHEME</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEMES.map((t) => {
            const active = t.key === theme;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTheme(t.key)}
                className="term-button text-xs flex items-center gap-2 justify-start"
                style={{
                  borderColor: active ? t.vars["--term-fg-bright"] : t.vars["--term-border"],
                  color: t.vars["--term-fg"],
                  background: active ? t.vars["--term-bg"] : "transparent",
                  boxShadow: active
                    ? `0 0 8px rgba(${t.vars["--term-glow-rgb"]}, 0.5)`
                    : "none",
                }}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full border"
                  style={{
                    backgroundColor: t.vars["--term-fg"],
                    borderColor: t.vars["--term-fg-bright"],
                  }}
                  aria-hidden
                />
                {active ? `[${t.label}]` : t.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm text-[var(--term-fg-dim)]">TERMINAL FONT</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FONTS.map((f) => {
            const active = f.key === font;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => chooseFont(f.key)}
                className="term-button text-sm"
                style={{
                  fontFamily: f.stack,
                  borderColor: active ? "var(--term-fg-bright)" : "var(--term-border)",
                  boxShadow: active ? "0 0 8px rgba(var(--term-glow-rgb), 0.4)" : "none",
                }}
              >
                {active ? `[${f.label}]` : f.label}
                <span className="block text-xs opacity-70">AaBb 0123</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="pt-2 border-t border-[var(--term-border)]/40">
        <button type="button" onClick={resetAll} className="term-button text-xs">
          RESET TO DEFAULT
        </button>
        <p className="text-xs text-[var(--term-fg-dim)] mt-2">
          PREFERENCES ARE SAVED TO THIS BROWSER AND APPLY INSTANTLY.
        </p>
      </div>
    </div>
  );
}
