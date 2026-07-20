import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

// Resolves an SCP designation (e.g. "173", "SCP-173") to its file and redirects
// to the detail page. Used by the hidden terminal's `access <SCP>` command.
// Honors the viewer's clearance — unreadable files are treated as not found.
function normalize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const raw = req.nextUrl.searchParams.get("q") ?? "";
  const query = normalize(raw);

  if (!query) {
    return NextResponse.redirect(new URL("/scp", req.url));
  }

  const files = await db.scpFile.findMany({
    where: {
      OR: [
        { clearanceRequired: { lte: user.clearance } },
        {
          accessGrants: {
            some: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
          },
        },
      ],
    },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });

  // Prefer a title that carries the full "SCP-<n>" token; fall back to any
  // title containing the query.
  const withScp = normalize(query.startsWith("SCP") ? query : `SCP${query}`);
  const match =
    files.find((f) => normalize(f.title).includes(withScp)) ??
    files.find((f) => normalize(f.title).includes(query));

  return NextResponse.redirect(
    new URL(match ? `/scp/${match.id}` : "/scp?access=notfound", req.url)
  );
}
