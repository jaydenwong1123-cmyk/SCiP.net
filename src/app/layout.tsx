import type { Metadata } from "next";
import "./globals.css";
import {
  THEME_MAP,
  FONT_MAP,
  THEME_STORAGE_KEY,
  FONT_STORAGE_KEY,
  DEFAULT_THEME,
  DEFAULT_FONT,
} from "@/lib/appearance";

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
    var t = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) || ${JSON.stringify(
      DEFAULT_THEME
    )};
    var f = localStorage.getItem(${JSON.stringify(FONT_STORAGE_KEY)}) || ${JSON.stringify(
      DEFAULT_FONT
    )};
    var vars = THEMES[t] || THEMES[${JSON.stringify(DEFAULT_THEME)}];
    var root = document.documentElement;
    for (var k in vars) root.style.setProperty(k, vars[k]);
    root.style.setProperty('--term-font', FONTS[f] || FONTS[${JSON.stringify(DEFAULT_FONT)}]);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
