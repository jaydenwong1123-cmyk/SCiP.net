import { describe, it, expect } from "vitest";
import { ciVisibleTo, ciEnabled, ciModeOf } from "./access";
import { RAISA_DEPARTMENT } from "@/lib/departments";

const member = { earlyAccess: false, isInsurgent: false };
const tester = { earlyAccess: true, isInsurgent: false };
const insurgent = { earlyAccess: false, isInsurgent: true };
const raisa = { earlyAccess: false, isInsurgent: false, department: RAISA_DEPARTMENT };

describe("ciVisibleTo", () => {
  it("shows nothing to anyone while off", () => {
    const cfg = { ciMode: "off" };
    expect(ciVisibleTo(member, cfg)).toBe(false);
    expect(ciVisibleTo(tester, cfg)).toBe(false);
    expect(ciVisibleTo(insurgent, cfg)).toBe(false);
    expect(ciVisibleTo(raisa, cfg)).toBe(false);
  });
  it("shows only testers, CI and RAISA during early access", () => {
    const cfg = { ciMode: "early" };
    expect(ciVisibleTo(member, cfg)).toBe(false);
    expect(ciVisibleTo(tester, cfg)).toBe(true);
    expect(ciVisibleTo(insurgent, cfg)).toBe(true);
    expect(ciVisibleTo(raisa, cfg)).toBe(true);
  });
  it("shows everyone once live", () => {
    const cfg = { ciMode: "live" };
    expect(ciVisibleTo(member, cfg)).toBe(true);
    expect(ciVisibleTo(tester, cfg)).toBe(true);
  });
  it("treats an unknown mode as off", () => {
    expect(ciModeOf({ ciMode: "LIVE" })).toBe("off");
    expect(ciEnabled({ ciMode: "" })).toBe(false);
    expect(ciVisibleTo(tester, { ciMode: "beta" })).toBe(false);
  });
});
