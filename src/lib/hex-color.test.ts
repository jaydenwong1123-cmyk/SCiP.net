import { describe, it, expect } from "vitest";
import {
  normalizeHexColor,
  relativeLuminance,
  textColorOnGradient,
  gradientCss,
} from "./hex-color";

describe("normalizeHexColor", () => {
  it("accepts six digits with and without the hash", () => {
    expect(normalizeHexColor("#33FF66")).toBe("#33ff66");
    expect(normalizeHexColor("33ff66")).toBe("#33ff66");
  });

  it("expands three-digit shorthand", () => {
    expect(normalizeHexColor("#abc")).toBe("#aabbcc");
    expect(normalizeHexColor("f00")).toBe("#ff0000");
  });

  it("tolerates surrounding whitespace from a paste", () => {
    expect(normalizeHexColor("  #050705\n")).toBe("#050705");
  });

  it("rejects anything that is not a hex colour", () => {
    // The rejects that matter are the CSS-injection shapes: these land in a
    // style attribute, so "almost a colour" must fail rather than be patched.
    for (const bad of [
      "",
      "   ",
      "#12",
      "#12345",
      "#1234567",
      "red",
      "rgb(1,2,3)",
      "#zzzzzz",
      "#33ff66; background: url(x)",
      "url(javascript:alert(1))",
      "#33ff66)",
    ]) {
      expect(normalizeHexColor(bad), bad).toBeNull();
    }
  });
});

describe("relativeLuminance", () => {
  it("anchors at black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("textColorOnGradient", () => {
  it("picks white over a dark pair and black over a light one", () => {
    expect(textColorOnGradient("#050705", "#1e8f3d")).toBe("#ffffff");
    expect(textColorOnGradient("#ffee33", "#ffffff")).toBe("#000000");
  });

  it("judges a mixed pair on its worst stop, not its average", () => {
    // Mid-grey to white is dark enough on average to tempt white text, which
    // would then vanish over the white end. The worst stop decides.
    expect(textColorOnGradient("#666666", "#ffffff")).toBe("#000000");
  });

  it("is order-independent", () => {
    expect(textColorOnGradient("#050705", "#c08cff")).toBe(
      textColorOnGradient("#c08cff", "#050705")
    );
  });
});

describe("gradientCss", () => {
  it("renders both stops into one linear-gradient", () => {
    expect(gradientCss("#33ff66", "#050705")).toBe(
      "linear-gradient(135deg, #33ff66 0%, #050705 100%)"
    );
  });
});
