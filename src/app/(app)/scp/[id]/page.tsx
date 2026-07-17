import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";

export default async function ScpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const file = await db.scpFile.findUnique({
    where: { id },
    include: { author: { select: { displayName: true } } },
  });

  if (!file || file.clearanceRequired > user.clearance) notFound();

  return (
    <div className="term-panel space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg tracking-widest">:: {file.title.toUpperCase()} ::</h1>
        <Link href="/scp" className="term-link text-sm">
          [BACK TO ARCHIVE]
        </Link>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        CLEARANCE REQUIRED: {clearanceLabel(file.clearanceRequired)} — AUTHOR:{" "}
        {file.author.displayName}
      </p>
      <pre className="whitespace-pre-wrap font-mono text-sm">{file.body}</pre>
    </div>
  );
}
