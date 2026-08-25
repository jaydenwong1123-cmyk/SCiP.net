// Parsing and contrast maths for operator-supplied hex colours.
//
// Anything a member can paste in and have rendered as CSS has to be normalised
// on the server before it is stored, never merely escaped on the way out. These
// values end up inside a `style` attribute, so the parser below is deliberately
// a whitelist — six or three hex digits and nothing else. A value that does not
// match is rejected outright rather than sanitised into something adjacent,
// because "almost a colour" is exactly the shape a CSS injection takes.

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Normalise a pasted colour to `#rrggbb` lowercase, or null if it isn't one.
 * Accepts `#abc`, `abc`, `#AABBCC`, `aabbcc`.
 */
export function normalizeHexColor(input: string): string | null {
  const match = HEX_RE.exec(input.trim());
  if (!match) return null;
  const digits = match[1].toLowerCase();
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((d) => d + d)
          .join("")
      : digits;
  return `#${full}`;
}

/** The three channels of a normalised `#rrggbb`, as 0-255 ints. */
function channels(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Black or white text, whichever reads better across a two-stop gradient.
 *
 * Judged on the DARKER of the two stops rather than their average: the text
 * runs the full width of the band, so it has to stay legible at the worst point
 * along it, not the mean one. Averaging is how a light-to-dark gradient ends up
 * with white text that vanishes over its pale end.
 */
export function textColorOnGradient(from: string, to: string): string {
  const darkest = Math.min(relativeLuminance(from), relativeLuminance(to));
  const lightest = Math.max(relativeLuminance(from), relativeLuminance(to));
  // Contrast ratio of white and of black against the stop each does worst on.
  const whiteWorst = 1.05 / (lightest + 0.05);
  const blackWorst = (darkest + 0.05) / 0.05;
  return whiteWorst >= blackWorst ? "#ffffff" : "#000000";
}

/** The CSS this pair renders as. One definition, so panel and preview agree. */
export function gradientCss(from: string, to: string): string {
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}
