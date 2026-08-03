// Role constants that both the server and the admin UI need. Kept out of
// session.ts, which pulls in the database and auth and so can never be
// imported from a client component.

// The number of Co-Owner seats. Owner-equivalent authority is deliberately
// scarce: appointing one is a confirmed, single act, and once every seat is
// filled the owner must revoke a sitting Co-Owner before appointing another.
// See the role hierarchy in session.ts.
export const MAX_CO_OWNERS = 2;
