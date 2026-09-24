import { describe, it, expect } from "vitest";
import type { InteractionMember } from "@/lib/discord/types";
import {
  EMPTY_CONFIG,
  emptyDivisionConfigs,
  type CouncilConfig,
  type DivisionConfigs,
} from "./config";
import {
  canAward,
  canReview,
  isHands,
  isMember,
  isScarlet,
  reviewableDivisions,
} from "./permissions";

// Who may act in which division. The failure this guards against is one
// division's HR promoting, or handing points to, members of another.

const CONFIG: CouncilConfig = {
  ...EMPTY_CONFIG,
  guildId: "g1",
  handsRoleId: "hands",
  scarletRoleId: "scarlet",
};

const DIVS: DivisionConfigs = {
  ...emptyDivisionConfigs(),
  clerical: { reviewerRoleId: "c-hr", staffRoleId: "c-staff", reviewChannelId: "", divisionRoleId: "c-div" },
  operational: { reviewerRoleId: "o-hr", staffRoleId: "o-staff", reviewChannelId: "", divisionRoleId: "" },
  judicial: { reviewerRoleId: "j-hr", staffRoleId: "j-staff", reviewChannelId: "", divisionRoleId: "" },
  enforcers: { reviewerRoleId: "", staffRoleId: "e-staff", reviewChannelId: "", divisionRoleId: "" },
  legislators: { reviewerRoleId: "", staffRoleId: "", reviewChannelId: "", divisionRoleId: "" },
};

const member = (roles: string[], permissions = "0"): InteractionMember => ({
  user: { id: "u1", username: "agent" },
  roles,
  permissions,
});

describe("division review", () => {
  it("lets a division's HR review only their own division", () => {
    expect(canReview(member(["c-hr"]), CONFIG, DIVS, "clerical")).toBe(true);
    expect(canReview(member(["c-hr"]), CONFIG, DIVS, "operational")).toBe(false);
    expect(canReview(member(["c-hr"]), CONFIG, DIVS, "judicial")).toBe(false);
  });

  it("lets Judicial HR review both Judicial subdivisions", () => {
    const jhr = member(["j-hr"]);
    expect(canReview(jhr, CONFIG, DIVS, "enforcers")).toBe(true);
    expect(canReview(jhr, CONFIG, DIVS, "legislators")).toBe(true);
    expect(reviewableDivisions(jhr, CONFIG, DIVS)).toEqual([
      "judicial",
      "enforcers",
      "legislators",
    ]);
  });

  it("lets Scarlet and Hands review everything", () => {
    for (const roles of [["scarlet"], ["hands"]]) {
      expect(reviewableDivisions(member(roles), CONFIG, DIVS)).toHaveLength(5);
    }
  });

  it("treats server administrators as Hands", () => {
    const admin = member([], "8");
    expect(isHands(admin, CONFIG)).toBe(true);
    expect(isScarlet(admin, CONFIG)).toBe(true);
  });

  it("does not make Scarlet a Hand", () => {
    expect(isHands(member(["scarlet"]), CONFIG)).toBe(false);
  });
});

describe("points authority", () => {
  it("lets staff award points in their division but not review it", () => {
    const staff = member(["o-staff"]);
    expect(canAward(staff, CONFIG, DIVS, "operational")).toBe(true);
    expect(canReview(staff, CONFIG, DIVS, "operational")).toBe(false);
    expect(canAward(staff, CONFIG, DIVS, "clerical")).toBe(false);
  });

  it("keeps subdivision staff inside their subdivision", () => {
    const e = member(["e-staff"]);
    expect(canAward(e, CONFIG, DIVS, "enforcers")).toBe(true);
    expect(canAward(e, CONFIG, DIVS, "legislators")).toBe(false);
    expect(canAward(e, CONFIG, DIVS, "judicial")).toBe(false);
  });

  it("lets Judicial staff award in the subdivisions", () => {
    expect(canAward(member(["j-staff"]), CONFIG, DIVS, "legislators")).toBe(true);
  });
});

describe("nothing falls open", () => {
  it("grants nothing through an unconfigured role", () => {
    const blank = { ...emptyDivisionConfigs() };
    const nobody = member(["random"]);
    expect(reviewableDivisions(nobody, EMPTY_CONFIG, blank)).toEqual([]);
    expect(canAward(nobody, EMPTY_CONFIG, blank, "clerical")).toBe(false);
  });

  it("locks the bot to the member role once one is set, except for its own roles", () => {
    const locked = { ...CONFIG, memberRoleId: "verified" };
    expect(isMember(member(["random"]), locked, DIVS)).toBe(false);
    expect(isMember(member(["verified"]), locked, DIVS)).toBe(true);
    expect(isMember(member(["c-div"]), locked, DIVS)).toBe(true);
    expect(isMember(member(["o-hr"]), locked, DIVS)).toBe(true);
  });
});
