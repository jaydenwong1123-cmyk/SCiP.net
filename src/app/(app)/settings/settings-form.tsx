"use client";

import { useEffect, useState } from "react";
import {
  THEMES,
  FONTS,
  DENSITIES,
  THEME_MAP,
  FONT_MAP,
  DENSITY_MAP,
  THEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  DENSITY_STORAGE_KEY,
  DEFAULT_THEME,
  DEFAULT_FONT,
  DEFAULT_DENSITY,
} from "@/lib/appearance";
import { TickRule } from "@/components/hud";

function applyTheme(themeKey: string) {
  const vars = THEME_MAP[themeKey] ?? THEME_MAP[DEFAULT_THEME];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

function applyFont(fontKey: string) {
  const stack = FONT_MAP[fontKey] ?? FONT_MAP[DEFAULT_FONT];
  document.documentElement.style.setProperty("--term-font", stack);
}

function applyDensity(densityKey: string) {
  const vars = DENSITY_MAP[densityKey] ?? DENSITY_MAP[DEFAULT_DENSITY];
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
}

export function SettingsForm() {
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [font, setFont] = useState(DEFAULT_FONT);
  const [density, setDensity] = useState(DEFAULT_DENSITY);

  // Load saved values on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME);
    setFont(localStorage.getItem(FONT_STORAGE_KEY) ?? DEFAULT_FONT);
    setDensity(localStorage.getItem(DENSITY_STORAGE_KEY) ?? DEFAULT_DENSITY);
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

  function chooseDensity(key: string) {
    setDensity(key);
    localStorage.setItem(DENSITY_STORAGE_KEY, key);
    applyDensity(key);
  }

  function resetAll() {
    chooseTheme(DEFAULT_THEME);
    chooseFont(DEFAULT_FONT);
    chooseDensity(DEFAULT_DENSITY);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="hud-readout__label">DISPLAY COLOR SCHEME</h2>
        {/* Each swatch is a miniature of the console rendered in that preset's
            own palette — a bordered surface, a title line, a body line and a
            signal row — so the choice is made by looking at the thing rather
            than by reading its name. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {THEMES.map((t) => {
            const active = t.key === theme;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => chooseTheme(t.key)}
                aria-pressed={active}
                className="text-left p-0 border cursor-pointer"
                style={{
                  borderColor: active
                    ? t.vars["--term-fg-bright"]
                    : t.vars["--term-border"],
                  background: t.vars["--term-bg"],
                  boxShadow: active
                    ? `0 0 0 1px ${t.vars["--term-fg-bright"]}, 0 0 12px rgba(${t.vars["--term-glow-rgb"]}, 0.35)`
                    : "none",
                }}
              >
                <span
                  className="flex items-center justify-between px-2 py-1 border-b"
                  style={{
                    borderColor: t.vars["--term-border"],
                    color: t.vars["--term-fg-bright"],
                    fontSize: "var(--hud-t-micro)",
                    letterSpacing: "0.16em",
                  }}
                >
                  {t.label}
                  {active && <span aria-hidden>◀</span>}
                </span>
                <span className="block px-2 py-2 space-y-1">
                  <span
                    className="block h-1"
                    style={{ background: t.vars["--term-fg"], width: "70%" }}
                    aria-hidden
                  />
                  <span
                    className="block h-1"
                    style={{ background: t.vars["--term-fg-dim"], width: "90%" }}
                    aria-hidden
                  />
                  <span
                    className="block h-1"
                    style={{ background: t.vars["--term-fg-dim"], width: "45%" }}
                    aria-hidden
                  />
                  <span className="flex gap-1 pt-1" aria-hidden>
                    <span
                      className="w-2 h-2"
                      style={{ background: t.vars["--term-fg-bright"] }}
                    />
                    <span className="w-2 h-2" style={{ background: "#ffcc55" }} />
                    <span className="w-2 h-2" style={{ background: "#ff5555" }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="hud-readout__label">TERMINAL FONT</h2>
        <div className="hud-segmented flex-wrap">
          {FONTS.map((f) => {
            const active = f.key === font;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => chooseFont(f.key)}
                aria-pressed={active}
                className={`hud-seg flex-col items-start gap-0 ${active ? "hud-seg--on" : ""}`}
                style={{ fontFamily: f.stack }}
              >
                {f.label}
                <span className="block text-[10px] opacity-70">AaBb 0123</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="hud-readout__label">DISPLAY DENSITY</h2>
        <div className="hud-segmented flex-wrap">
          {DENSITIES.map((d) => {
            const active = d.key === density;
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => chooseDensity(d.key)}
                aria-pressed={active}
                className={`hud-seg flex-col items-start gap-0 text-left ${active ? "hud-seg--on" : ""}`}
              >
                {d.label}
                <span className="block text-[10px] opacity-70 normal-case">
                  {d.hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <TickRule />
      <div>
        <button
          type="button"
          onClick={resetAll}
          className="term-button term-button--ghost term-button--sm"
        >
          RESET TO DEFAULT
        </button>
        <p className="text-[10px] text-[var(--term-fg-dim)] mt-2">
          PREFERENCES ARE SAVED TO THIS BROWSER AND APPLY INSTANTLY.
        </p>
      </div>
    </div>
  );
}
