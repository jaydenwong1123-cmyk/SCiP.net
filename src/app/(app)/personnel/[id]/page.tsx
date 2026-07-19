import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser, canAnnotateMembers, hasStaffPowers } from "@/lib/session";
import { clearanceDisplay } from "@/lib/clearance";
import { renderRedacted, canBypassRedaction } from "@/lib/redact";
import { addMemberNoteAction, deleteMemberNoteAction } from "../actions";

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
      designation: true,
      department: true,
      personalFile: true,
      isOwner: true,
      isAdmin: true,
      isStaff: true,
    },
  });

  if (!person || !person.displayName) notFound();

  // Notes are visible only to authorized personnel, and never to the subject.
  const showNotes = canAnnotateMembers(viewer) && viewer.id !== person.id;
  const notes = showNotes
    ? await db.memberNote.findMany({
        where: { subjectId: person.id },
        orderBy: [{ flagged: "desc" }, { createdAt: "desc" }],
        include: { author: { select: { displayName: true } } },
      })
    : [];
  const canDeleteAny = hasStaffPowers(viewer);

  return (
    <div className="space-y-4">
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
          CLEARANCE: {clearanceDisplay(person.clearance, person.designation)}
          {person.department ? ` — ${person.department}` : ""}
        </p>
        <pre className="whitespace-pre-wrap break-words font-mono text-sm term-panel min-h-[10rem]">
          {person.personalFile
            ? renderRedacted(person.personalFile, viewer.clearance, canBypassRedaction(viewer))
            : "[NO FILE ON RECORD]"}
        </pre>
      </div>

      {showNotes && (
        <div className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-amber)]">
            ⚑ CLASSIFIED PERSONNEL NOTES — L-5+ / STAFF ONLY
          </h2>
          <p className="text-xs text-[var(--term-fg-dim)]">
            THIS SUBJECT CANNOT SEE THIS SECTION.
          </p>

          <div className="space-y-2">
            {notes.length === 0 && (
              <p className="text-sm text-[var(--term-fg-dim)]">NO NOTES ON RECORD.</p>
            )}
            {notes.map((n) => (
              <div
                key={n.id}
                className="border-b border-[var(--term-border)]/30 py-2 space-y-1"
                style={
                  n.flagged ? { borderLeft: "3px solid var(--term-red)", paddingLeft: "0.5rem" } : undefined
                }
              >
                <div className="flex items-center justify-between text-xs text-[var(--term-fg-dim)]">
                  <span>
                    {n.flagged && (
                      <span className="text-[var(--term-red)]">⚑ FLAGGED — </span>
                    )}
                    {n.author.displayName ?? "UNKNOWN"} —{" "}
                    {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  {(canDeleteAny || n.authorId === viewer.id) && (
                    <form action={deleteMemberNoteAction}>
                      <input type="hidden" name="noteId" value={n.id} />
                      <button
                        className="term-button text-xs"
                        style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
                      >
                        DELETE
                      </button>
                    </form>
                  )}
                </div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {n.body}
                </pre>
              </div>
            ))}
          </div>

          <form action={addMemberNoteAction} className="space-y-2 pt-2 border-t border-[var(--term-border)]/40">
            <input type="hidden" name="subjectId" value={person.id} />
            <textarea
              name="body"
              required
              rows={3}
              maxLength={5000}
              placeholder="Add a confidential note about this member..."
              className="term-input resize-y"
            />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="flagged" value="true" />
                FLAG THIS MEMBER
              </label>
              <button className="term-button text-xs">ADD NOTE</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
