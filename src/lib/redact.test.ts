import { describe, it, expect } from "vitest";
import { canBypassRedaction, redactToText } from "./redact";
import { OWNER_CLEARANCE } from "./clearance";

// Redaction is a security boundary, not a display helper.
//
// The rule these tests exist to hold: hidden text must never appear in output
// bound for a browser that is not cleared for it. redactToText is the string
// form of the same resolver renderRedacted uses, so asserting on it asserts on
// the gating logic itself rather than on JSX.

const viewer = (over: Partial<Parameters<typeof canBypassRedaction>[0]> = {}) => ({
  clearance: 1,
  isOwner: false,
  isCoOwner: false,
  isAdmin: false,
  ...over,
});

describe("canBypassRedaction", () => {
  it("admits rank 7, admins, the owner and the co-owner", () => {
    expect(canBypassRedaction(viewer({ clearance: OWNER_CLEARANCE }))).toBe(true);
    expect(canBypassRedaction(viewer({ isOwner: true }))).toBe(true);
    expect(canBypassRedaction(viewer({ isCoOwner: true }))).toBe(true);
    expect(canBypassRedaction(viewer({ isAdmin: true }))).toBe(true);
  });

  it("excludes Staff — deliberately", () => {
    // Narrowed in commit 9b78887 and argued in the comment on this function:
    // Staff are numerous enough that including them made a full redaction mean
    // very little. This test exists so that decision cannot be reverted by
    // accident.
    expect(
      canBypassRedaction({
        clearance: 5,
        isOwner: false,
        isCoOwner: false,
        isAdmin: false,
      })
    ).toBe(false);
  });

  it("excludes an ordinary high-clearance member below rank 7", () => {
    expect(canBypassRedaction(viewer({ clearance: OWNER_CLEARANCE - 1 }))).toBe(
      false
    );
  });
});

describe("redactToText", () => {
  it("hides a level-tagged span from an under-cleared viewer", () => {
    const out = redactToText("AGENT [*VANCE*][4] IS ON SITE", 3, false);
    expect(out).not.toContain("VANCE");
    expect(out).toContain("█");
    expect(out).toContain("AGENT");
    expect(out).toContain("IS ON SITE");
  });

  it("reveals a level-tagged span at or above the required rank", () => {
    expect(redactToText("[*VANCE*][4]", 4, false)).toBe("VANCE");
    expect(redactToText("[*VANCE*][4]", 5, false)).toBe("VANCE");
  });

  it("never reveals an untagged redaction to an ordinary viewer", () => {
    // [*X*] with no level is walled off from everyone outside the top of the
    // chain of command, at ANY clearance — that is what distinguishes it from
    // a numbered redaction.
    for (let rank = 1; rank <= 6; rank++) {
      const out = redactToText("[*BLACKSITE*]", rank, false);
      expect(out, `rank ${rank} read an untagged redaction`).not.toContain(
        "BLACKSITE"
      );
    }
  });

  it("reveals everything to a bypassing viewer", () => {
    expect(redactToText("[*BLACKSITE*]", 1, true)).toBe("BLACKSITE");
    expect(redactToText("[*VANCE*][7]", 1, true)).toBe("VANCE");
  });

  it("accepts label tags, not just numbers", () => {
    expect(redactToText("[*X*][L-O5]", 6, false)).toBe("X");
    expect(redactToText("[*X*][L-O5]", 5, false)).not.toContain("X");
    expect(redactToText("[*X*][OMNI]", 7, false)).toBe("X");
    expect(redactToText("[*X*][OMNI]", 6, false)).not.toContain("X");
  });

  it("treats an unparseable tag as a full redaction", () => {
    // Failing closed matters more here than being forgiving: a typo'd tag must
    // hide the text, never expose it.
    for (const tag of ["NONSENSE", "", "0", "8", "-1", "+3", "L-", "3.5"]) {
      const out = redactToText(`[*X*][${tag}]`, 7, false);
      expect(out, `tag "${tag}" failed open`).not.toContain("X");
    }
  });

  it("masks with a run of the same width, clamped", () => {
    // Width is preserved so the redaction reads as a redaction, but clamped so
    // the mask cannot itself leak the exact length of a very long secret.
    expect(redactToText("[*ABCDE*]", 1, false)).toBe("█".repeat(5));
    // Floor of 3 for short content.
    expect(redactToText("[*AB*]", 1, false)).toBe("█".repeat(3));
    // Ceiling of 60.
    const long = "Z".repeat(200);
    expect(redactToText(`[*${long}*]`, 1, false)).toBe("█".repeat(60));
  });

  it("handles several redactions in one body independently", () => {
    const out = redactToText("[*A*][2] AND [*B*][6] AND [*C*]", 2, false);
    expect(out).toContain("A");
    expect(out).not.toContain("B");
    expect(out).not.toContain("C");
  });

  it("is stateless across calls", () => {
    // REDACT_RE is a module-level /g regex, so a leaked lastIndex between calls
    // would make the SECOND read of the same string behave differently from the
    // first — the kind of bug that shows up as an intermittent leak.
    const text = "[*A*][2] [*B*][2]";
    const first = redactToText(text, 1, false);
    const second = redactToText(text, 1, false);
    expect(second).toBe(first);
    expect(first).not.toContain("A");
    expect(first).not.toContain("B");
  });

  it("leaves unmarked text untouched", () => {
    expect(redactToText("NOTHING HIDDEN HERE", 1, false)).toBe(
      "NOTHING HIDDEN HERE"
    );
    expect(redactToText("", 1, false)).toBe("");
  });
});
