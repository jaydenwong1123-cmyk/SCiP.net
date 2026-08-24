import { describe, it, expect } from "vitest";
import {
  filterHref,
  hasActiveFilters,
  pickOption,
  pickRank,
  pickQuery,
  MAX_QUERY_LENGTH,
} from "./filters";

describe("filterHref", () => {
  it("returns the bare path when nothing is set", () => {
    expect(filterHref("/scp", {})).toBe("/scp");
    expect(filterHref("/scp", { class: null, level: null })).toBe("/scp");
  });

  it("preserves other facets while changing one", () => {
    const current = { class: "Keter", level: "4", q: null };
    expect(filterHref("/scp", current, { level: "5" })).toBe(
      "/scp?class=Keter&level=5"
    );
  });

  it("clears one facet without disturbing the rest", () => {
    const current = { class: "Keter", level: "4" };
    expect(filterHref("/scp", current, { class: null })).toBe("/scp?level=4");
  });

  it("drops empty values rather than serializing them", () => {
    // "?class=" would be a distinct URL from "/scp" for the router and the back
    // button, for no benefit.
    expect(filterHref("/scp", { class: "", level: undefined })).toBe("/scp");
  });

  it("encodes values that need it", () => {
    const href = filterHref("/personnel", { dept: "O5 Command" });
    expect(href).toContain("O5+Command");
    expect(href.startsWith("/personnel?")).toBe(true);
  });
});

describe("hasActiveFilters", () => {
  it("is false only when every facet is empty", () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ a: null, b: undefined, c: "" })).toBe(false);
    expect(hasActiveFilters({ a: null, b: "x" })).toBe(true);
  });
});

describe("pickOption", () => {
  const allowed = ["Safe", "Euclid", "Keter"];

  it("accepts a known option", () => {
    expect(pickOption("Keter", allowed)).toBe("Keter");
  });

  it("rejects anything else, including case variants", () => {
    // These values reach a Prisma `where`. An unrecognised one must become null
    // so the station renders unfiltered, not empty.
    for (const bad of ["keter", "Neutralized", "", undefined, "'; DROP--"]) {
      expect(pickOption(bad as string | undefined, allowed)).toBeNull();
    }
  });
});

describe("pickRank", () => {
  it("accepts an integer inside the range", () => {
    expect(pickRank("3", 1, 5)).toBe(3);
    expect(pickRank("1", 1, 5)).toBe(1);
    expect(pickRank("5", 1, 5)).toBe(5);
  });

  it("rejects out-of-range values", () => {
    // The ceiling is the viewer's own clearance on the document registries, so
    // this is what stops "?level=7" being used to probe above it.
    expect(pickRank("6", 1, 5)).toBeNull();
    expect(pickRank("0", 1, 5)).toBeNull();
    expect(pickRank("-2", 1, 5)).toBeNull();
  });

  it("rejects non-integers and junk", () => {
    for (const bad of ["", "abc", "2.5", "1e3", undefined, " "]) {
      expect(pickRank(bad as string | undefined, 1, 5)).toBeNull();
    }
  });
});

describe("pickQuery", () => {
  it("trims and keeps a usable query", () => {
    expect(pickQuery("  reactor  ")).toBe("reactor");
  });

  it("returns null for nothing usable", () => {
    for (const empty of ["", "   ", undefined]) {
      expect(pickQuery(empty as string | undefined)).toBeNull();
    }
  });

  it("caps the length", () => {
    const long = "a".repeat(MAX_QUERY_LENGTH + 50);
    expect(pickQuery(long)!.length).toBe(MAX_QUERY_LENGTH);
  });
});
