import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { clearanceLabel } from "@/lib/clearance";
import { renderRedacted } from "@/lib/redact";

export default async function PersonnelFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireUser();
  const { id } = await params;
  const person = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      clearance: true,
      department: true,
      personalFile: true,
      isOwner: true,
      isAdmin: true,
      isStaff: true,
    },
  });

  if (!person || !person.displayName) notFound();

  const role = person.isOwner
    ? "FOUNDATION OWNER"
    : person.isAdmin
      ? "ADMIN"
      : person.isStaff
        ? "STAFF"
        : null;

  return (
    <div className="term-panel space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg tracking-widest">
          :: PERSONNEL FILE — {person.displayName.toUpperCase()} ::
        </h1>
        <Link href="/personnel" className="term-link text-sm">
          [BACK TO ROSTER]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        CLEARANCE: {clearanceLabel(person.clearance)}
        {role ? ` — ${role}` : ""}
        {person.department ? ` — ${person.department}` : ""}
      </p>
      <pre className="whitespace-pre-wrap font-mono text-sm term-panel min-h-[10rem]">
        {person.personalFile
          ? renderRedacted(person.personalFile, viewer.clearance)
          : "[NO FILE ON RECORD]"}
      </pre>
    </div>
  );
}
