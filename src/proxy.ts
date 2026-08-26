import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Built from the provider-free config, NOT from lib/auth's instance.
//
// Proxy runs on the Node.js runtime for every request Next handles, prefetched
// routes included, so whatever this file imports is cold-started once per link
// the command rail puts on screen. Importing `auth` from lib/auth traced
// Prisma's query engine, @libsql/client and bcryptjs into that bundle (~89 MB)
// because the Credentials provider's `authorize` closes over them.
//
// With the JWT session strategy this instance is all the gate below needs: it
// verifies and decodes the session cookie and never reaches the database. The
// real authorization checks happen in lib/session's requireUser() on the
// server, which is where they belong — this is only an optimistic redirect.
const { auth } = NextAuth(authConfig);

// `/terminated` is public because a full site shutdown darkens the login screen
// too — there would otherwise be nowhere for a signed-out visitor to land.
// `/sentinel` is deliberately NOT public: it is only ever reached by an
// already-authenticated owner.
const PUBLIC_PATHS = ["/login", "/register", "/maintenance", "/terminated"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/api/auth");

  if (!req.auth && !isPublic) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }

  return NextResponse.next();
});

// Everything except Next's own build output and the static assets in public/.
//
// The previous pattern excluded only `_next/static`, `_next/image` and the
// favicon, which left the proxy running on the rest of `/_next` and on every
// file under public/ — including the MEMETIC AGENT plates in public/memetic,
// which the overlay requests repeatedly. None of those are routes, so none of
// them need an auth gate; each one was buying a proxy invocation for nothing.
//
// Page routes still all match, which is what the gate below actually guards.
export const config = {
  matcher: [
    "/((?!_next/|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|css|js|map|txt|xml)$).*)",
  ],
};
