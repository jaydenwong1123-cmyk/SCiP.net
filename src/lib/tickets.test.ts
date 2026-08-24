import { describe, it, expect } from "vitest";
import {
  canHandleTicketType,
  handleableTicketTypes,
  canViewTicket,
  canRequestScpAccess,
  isValidTicketType,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
  TICKET_TYPE_DESCRIPTIONS,
  SCP_REQUEST_DEPARTMENTS,
} from "./tickets";

// Ticket queue routing.
//
// Visibility is DERIVED from `type` rather than stored on the row, so these
// predicates are the only thing standing between a Helper and the conduct
// appeals queue. Each ticket type routes to exactly one audience, and the
// hierarchy is strictly one-directional.

type Viewer = Parameters<typeof canHandleTicketType>[0];

const member: Viewer = {
  id: "u-member",
  isOwner: false,
  isCoOwner: false,
  isAdmin: false,
  isStaff: false,
  isHelper: false,
};
const helper: Viewer = { ...member, id: "u-helper", isHelper: true };
const staff: Viewer = { ...member, id: "u-staff", isStaff: true };
const admin: Viewer = { ...member, id: "u-admin", isAdmin: true };
const coOwner: Viewer = { ...member, id: "u-coowner", isCoOwner: true };
const owner: Viewer = { ...member, id: "u-owner", isOwner: true };

describe("registry", () => {
  it("labels and describes every type", () => {
    for (const type of Object.values(TICKET_TYPES)) {
      expect(TICKET_TYPE_LABELS[type]?.length).toBeGreaterThan(0);
      expect(TICKET_TYPE_DESCRIPTIONS[type]?.length).toBeGreaterThan(0);
    }
  });

  it("validates types strictly", () => {
    for (const type of Object.values(TICKET_TYPES)) {
      expect(isValidTicketType(type)).toBe(true);
    }
    for (const bad of ["", "GENERAL", "conductAppeal", "__proto__"]) {
      expect(isValidTicketType(bad)).toBe(false);
    }
  });
});

describe("general assistance", () => {
  it("is worked by Helper and above", () => {
    for (const v of [helper, staff, admin, coOwner, owner]) {
      expect(canHandleTicketType(v, TICKET_TYPES.general)).toBe(true);
    }
  });

  it("is not worked by an ordinary member", () => {
    expect(canHandleTicketType(member, TICKET_TYPES.general)).toBe(false);
  });
});

describe("bug reports", () => {
  it("go to the seeded owner alone", () => {
    expect(canHandleTicketType(owner, TICKET_TYPES.bug)).toBe(true);
  });

  it("are NOT visible to the co-owner", () => {
    // Deliberate, and documented: "owner powers" elsewhere means authority,
    // and this is an inbox. Asserted so it cannot be "fixed" by accident.
    expect(canHandleTicketType(coOwner, TICKET_TYPES.bug)).toBe(false);
  });

  it("are not visible to admins, staff or helpers", () => {
    for (const v of [admin, staff, helper, member]) {
      expect(canHandleTicketType(v, TICKET_TYPES.bug)).toBe(false);
    }
  });
});

describe("SCP access requests", () => {
  it("are worked by Admin and above only", () => {
    for (const v of [admin, coOwner, owner]) {
      expect(canHandleTicketType(v, TICKET_TYPES.scpAccess)).toBe(true);
    }
    // Granting access is an Admin power, so Staff do not work this queue.
    for (const v of [staff, helper, member]) {
      expect(canHandleTicketType(v, TICKET_TYPES.scpAccess)).toBe(false);
    }
  });

  it("may only be filed from the permitted departments", () => {
    for (const dept of SCP_REQUEST_DEPARTMENTS) {
      expect(canRequestScpAccess({ department: dept })).toBe(true);
    }
    for (const dept of [null, "", "Medical Department", "O5 Command"]) {
      expect(canRequestScpAccess({ department: dept })).toBe(false);
    }
  });
});

describe("conduct appeals", () => {
  it("are worked by Admin and above only", () => {
    for (const v of [admin, coOwner, owner]) {
      expect(canHandleTicketType(v, TICKET_TYPES.conductAppeal)).toBe(true);
    }
  });

  it("are NOT visible to Staff or Helpers", () => {
    // The evidence an appeal argues about (ConductRecord) is Admin+ only
    // because its rows are name-keyed — the exact thing the counter-intel
    // reveal ladder protects. A Helper here would see neither the evidence nor
    // be able to lift the sanction.
    for (const v of [staff, helper, member]) {
      expect(canHandleTicketType(v, TICKET_TYPES.conductAppeal)).toBe(false);
    }
  });
});

describe("queue listing", () => {
  it("gives a helper the general queue and nothing else", () => {
    expect(handleableTicketTypes(helper)).toEqual([TICKET_TYPES.general]);
  });

  it("gives staff no more than a helper — the tier grants no queues", () => {
    expect(handleableTicketTypes(staff)).toEqual([TICKET_TYPES.general]);
  });

  it("gives an admin everything except the owner's bug inbox", () => {
    const types = handleableTicketTypes(admin);
    expect(types).toContain(TICKET_TYPES.general);
    expect(types).toContain(TICKET_TYPES.scpAccess);
    expect(types).toContain(TICKET_TYPES.conductAppeal);
    expect(types).not.toContain(TICKET_TYPES.bug);
  });

  it("gives the owner every queue", () => {
    expect(handleableTicketTypes(owner).sort()).toEqual(
      [...Object.values(TICKET_TYPES)].sort()
    );
  });

  it("gives an ordinary member none", () => {
    expect(handleableTicketTypes(member)).toEqual([]);
  });

  it("rejects an unknown type rather than defaulting open", () => {
    expect(canHandleTicketType(owner, "not_a_type")).toBe(false);
  });
});

describe("canViewTicket", () => {
  it("always lets an author read their own ticket", () => {
    // Including a bug report, which nobody but the owner works.
    expect(
      canViewTicket(member, { authorId: member.id, type: TICKET_TYPES.bug })
    ).toBe(true);
    expect(
      canViewTicket(member, {
        authorId: member.id,
        type: TICKET_TYPES.conductAppeal,
      })
    ).toBe(true);
  });

  it("does not let one member read another's ticket", () => {
    expect(
      canViewTicket(member, { authorId: "someone-else", type: TICKET_TYPES.general })
    ).toBe(false);
    expect(
      canViewTicket(staff, {
        authorId: "someone-else",
        type: TICKET_TYPES.conductAppeal,
      })
    ).toBe(false);
  });

  it("lets a queue handler read a ticket they work", () => {
    expect(
      canViewTicket(admin, {
        authorId: "someone-else",
        type: TICKET_TYPES.conductAppeal,
      })
    ).toBe(true);
  });
});
