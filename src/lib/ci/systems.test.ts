import { describe, it, expect } from "vitest";
import { systemForPath, isCiSystem, isRoutedSystem, CI_SYSTEMS } from "./systems";

describe("systemForPath", () => {
  it("maps each section to its system", () => {
    expect(systemForPath("/scp")).toBe("archives");
    expect(systemForPath("/scp/abc123")).toBe("archives");
    expect(systemForPath("/messages/compose")).toBe("comms");
    expect(systemForPath("/secure-channel")).toBe("comms");
    expect(systemForPath("/personnel/xyz")).toBe("personnel");
    expect(systemForPath("/broadcasts")).toBe("broadcasts");
  });
  it("matches only on a path boundary", () => {
    expect(systemForPath("/scpfoo")).toBeNull();
    expect(systemForPath("/messagesx")).toBeNull();
  });
  it("leaves everything else alone", () => {
    expect(systemForPath("/")).toBeNull();
    expect(systemForPath("/menu")).toBeNull();
    expect(systemForPath("/compromised/archives")).toBeNull();
    expect(systemForPath("/counter-intel/siege")).toBeNull();
    expect(systemForPath(null)).toBeNull();
  });
});

describe("system registry", () => {
  it("knows its own ids", () => {
    for (const s of CI_SYSTEMS) expect(isCiSystem(s.id)).toBe(true);
    expect(isCiSystem("toaster")).toBe(false);
  });
  it("gives the mainframe no route", () => {
    expect(isRoutedSystem("mainframe")).toBe(false);
    expect(isRoutedSystem("archives")).toBe(true);
  });
});
