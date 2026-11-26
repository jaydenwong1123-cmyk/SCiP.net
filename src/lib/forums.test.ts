import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/session", () => ({
  hasAdminPowers: () => false,
  hasStaffPowers: () => false,
}));

import {
  FORUM_PAGE_SIZE,
  canEditForumPost,
  forumPageCount,
  isForumReactionKind,
  pickForumPage,
} from "@/lib/forums";

describe("forum paging", () => {
  it("always has at least one page", () => {
    expect(forumPageCount(0)).toBe(1);
    expect(forumPageCount(FORUM_PAGE_SIZE)).toBe(1);
    expect(forumPageCount(FORUM_PAGE_SIZE + 1)).toBe(2);
  });

  it("defaults to the last page", () => {
    expect(pickForumPage(undefined, FORUM_PAGE_SIZE * 3)).toBe(3);
    expect(pickForumPage("abc", FORUM_PAGE_SIZE * 3)).toBe(3);
  });

  it("clamps to the pages that exist", () => {
    expect(pickForumPage("0", 10)).toBe(1);
    expect(pickForumPage("99", FORUM_PAGE_SIZE * 2)).toBe(2);
    expect(pickForumPage("1", FORUM_PAGE_SIZE * 2)).toBe(1);
  });
});

describe("forum post permissions", () => {
  it("lets only the author edit", () => {
    expect(canEditForumPost({ id: "a" }, { authorId: "a" })).toBe(true);
    expect(canEditForumPost({ id: "b" }, { authorId: "a" })).toBe(false);
    expect(canEditForumPost({ id: "a" }, { authorId: null })).toBe(false);
  });
});

describe("forum reactions", () => {
  it("accepts only known kinds", () => {
    expect(isForumReactionKind("ack")).toBe(true);
    expect(isForumReactionKind("nope")).toBe(false);
  });
});
