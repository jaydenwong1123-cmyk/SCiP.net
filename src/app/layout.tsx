import type { Metadata } from "next";
import "./globals.css";
import {
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
import { getSiteConfig } from "@/lib/site-config";
import { gradientCss } from "@/lib/hex-color";

export const metadata: Metadata = {
  title: "SCiP.net // Secure Terminal",
  description: "SCP Foundation roleplay member terminal",
};

// Applied before first paint so a saved theme/font never flashes the default.
const appearanceScript = `
(function(){
  try {
    var THEMES = ${JSON.stringify(THEME_MAP)};
    var FONTS = ${JSON.stringify(FONT_MAP)};
    var DENSITIES = ${JSON.stringify(DENSITY_MAP)};
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || ${JSON.stringify(
      DEFAULT_THEME
    )};
    var f = localStorage.getItem(${JSON.stringify(FONT_STORAGE_KEY)}) || ${JSON.stringify(
      DEFAULT_FONT
    )};
    var d = localStorage.getItem(${JSON.stringify(DENSITY_STORAGE_KEY)}) || ${JSON.stringify(
      DEFAULT_DENSITY
    )};
    var vars = THEMES[t] || THEMES[${JSON.stringify(DEFAULT_THEME)}];
    var root = document.documentElement;
    for (var k in vars) root.style.setProperty(k, vars[k]);
    root.style.setProperty('--term-font', FONTS[f] || FONTS[${JSON.stringify(DEFAULT_FONT)}]);
    var dv = DENSITIES[d] || DENSITIES[${JSON.stringify(DEFAULT_DENSITY)}];
    for (var dk in dv) root.style.setProperty(dk, dv[dk]);
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Unlike the theme/font/density presets above, this is not a per-browser
  // preference read from localStorage — it is a single owner-set value for the
  // whole site, so it renders straight into the initial HTML rather than
  // through the pre-paint script. That also means it needs no localStorage
  // fallback dance: every visitor sees the same gradient, correct on first
  // paint, with no flash to cover.
  const siteConfig = await getSiteConfig();
  const htmlStyle =
    siteConfig.quartermasterFrom && siteConfig.quartermasterTo
      ? ({
          "--term-bg-image": gradientCss(
            siteConfig.quartermasterFrom,
            siteConfig.quartermasterTo
          ),
        } as React.CSSProperties)
      : undefined;

  return (
    <html lang="en" className="h-full" style={htmlStyle}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
