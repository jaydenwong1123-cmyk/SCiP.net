import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
