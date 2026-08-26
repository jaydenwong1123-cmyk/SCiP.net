import type { NextAuthConfig } from "next-auth";

// The half of the NextAuth setup that touches no database and no native crypto.
//
// This exists purely so `src/proxy.ts` can build a NextAuth instance without
// dragging the Credentials provider in behind it. The provider's `authorize`
// closes over `lib/db` (PrismaClient + @libsql/client) and `bcryptjs`, and
// Proxy runs on the Node.js runtime on *every* request — including every route
// Next prefetches for the links in the command rail. Importing the full config
// there traced ~89 MB into the proxy bundle, ~87 MB of it Prisma's query
// engine, so a single page view cold-started that bundle once per prefetched
// section.
//
// Next's own auth guide is explicit about this: Proxy should perform an
// optimistic check by reading the session cookie and nothing more. Keeping the
// providers list empty here is what makes that true — the JWT strategy means
// `auth()` in the proxy only verifies and decodes the cookie, which needs no
// provider and no database.
//
// Anything added below must stay free of database, filesystem and native
// imports. The real provider lives in lib/auth.ts, which spreads this config.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Deliberately empty. lib/auth.ts supplies the Credentials provider for the
  // route handler and for sign-in; the proxy never needs one.
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
