import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  requireUser,
  canAnnotateMembers,
  hasStaffPowers,
  canEditAnyPersonalFile,
} from "@/lib/session";
import { clearanceDisplay } from "@/lib/clearance";
import { renderBody } from "@/lib/render-body";
import {
  addMemberNoteAction,
  deleteMemberNoteAction,
  deletePersonnelAttachmentAction,
  deleteInfractionAction,
} from "../actions";
import { AttachmentList } from "@/components/attachment-list";
import { PersonnelAttachmentForm } from "./attachment-form";
import { InfractionForm } from "./infraction-form";
import {
  ATTACHMENT_ENTITIES,
  PERSONNEL_ATTACH_CLEARANCE,
  listAttachments,
} from "@/lib/attachments";
import { INFRACTION_SEVERITY_COLOR, type InfractionSeverity } from "@/lib/infractions";
import { redactNameToText, renderRedactedName } from "@/lib/redact";
import { ProfileForm } from "@/app/(app)/profile/profile-form";

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

  // Disciplinary record: visible to the subject themselves (it's a formal
  // record, not a private staff note) and to anyone who can file one.
  const canFileInfractions = canAnnotateMembers(viewer);
  const canSeeInfractions = viewer.id === person.id || canFileInfractions;
  const infractions = canSeeInfractions
    ? await db.memberInfraction.findMany({
        where: { subjectId: person.id },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Dossier attachments are L-5+ material: the same bar gates uploading,
  // listing, and the route that serves the bytes.
  const canSeeAttachments = viewer.clearance >= PERSONNEL_ATTACH_CLEARANCE;
  const attachments = canSeeAttachments
    ? await listAttachments(ATTACHMENT_ENTITIES.personnel, [person.id])
    : [];

  return (
    <div className="space-y-4">
      <div className="term-panel space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg tracking-widest">
            :: PERSONNEL FILE —{" "}
            {(viewer.id === person.id
              ? person.displayName
              : redactNameToText(person.displayName, viewer)
            ).toUpperCase()}{" "}
            ::
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
            ? await renderBody(person.personalFile, viewer)
            : "[NO FILE ON RECORD]"}
        </pre>
        {canEditAnyPersonalFile(viewer) && viewer.id !== person.id && (
          <div className="space-y-2 pt-2 border-t border-[var(--term-fg-dim)]/30">
            <p className="text-sm text-[var(--term-amber)]">
              ⧉ RAISA RECORDKEEPING — EDIT THIS FILE
            </p>
            <ProfileForm
              initialContent={person.personalFile ?? ""}
              subjectId={person.id}
            />
          </div>
        )}
      </div>

      {canSeeAttachments && (
        <div className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-amber)]">
            ⧉ ATTACHED EVIDENCE — L-5+ ONLY
          </h2>
          {attachments.length === 0 ? (
            <p className="text-sm text-[var(--term-fg-dim)]">
              NO IMAGES ATTACHED TO THIS FILE.
            </p>
          ) : (
            <div className="space-y-2">
              <AttachmentList attachments={attachments} />
              <div className="flex flex-wrap gap-2 pt-1">
                {attachments
                  // Uploaders may remove their own; staff may remove any.
                  // Mirrors the check the delete action re-applies server-side.
                  .filter((a) => a.uploaderId === viewer.id || canDeleteAny)
                  .map((a) => (
                    <form key={a.id} action={deletePersonnelAttachmentAction}>
                      <input type="hidden" name="attachmentId" value={a.id} />
                      <button
                        className="term-button text-[10px]"
                        style={{
                          borderColor: "var(--term-red)",
                          color: "var(--term-red)",
                        }}
                      >
                        REMOVE {a.filename}
                      </button>
                    </form>
                  ))}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-[var(--term-border)]/40">
            <PersonnelAttachmentForm subjectId={person.id} />
          </div>
        </div>
      )}

      {canSeeInfractions && (
        <div className="term-panel space-y-3">
          <h2 className="text-sm text-[var(--term-amber)]">
            ⚠ DISCIPLINARY RECORD
          </h2>

          <div className="space-y-2">
            {infractions.length === 0 && (
              <p className="text-sm text-[var(--term-fg-dim)]">
                NO INFRACTIONS ON RECORD.
              </p>
            )}
            {infractions.map((inf) => (
              <div
                key={inf.id}
                className="border-b border-[var(--term-border)]/30 py-2 space-y-1"
                style={{
                  borderLeft: `3px solid ${
                    INFRACTION_SEVERITY_COLOR[inf.severity as InfractionSeverity] ??
                    "var(--term-fg-dim)"
                  }`,
                  paddingLeft: "0.5rem",
                }}
              >
                <div className="flex items-center justify-between text-xs text-[var(--term-fg-dim)]">
                  <span
                    style={{
                      color:
                        INFRACTION_SEVERITY_COLOR[
                          inf.severity as InfractionSeverity
                        ] ?? undefined,
                    }}
                  >
                    {inf.severity} — {inf.issuerName || "UNKNOWN"} —{" "}
                    {inf.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </span>
                  {(canDeleteAny || inf.issuerId === viewer.id) && (
                    <form action={deleteInfractionAction}>
                      <input type="hidden" name="infractionId" value={inf.id} />
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
                  {inf.reason}
                </pre>
              </div>
            ))}
          </div>

          {canFileInfractions && viewer.id !== person.id && (
            <div className="pt-2 border-t border-[var(--term-border)]/40">
              <InfractionForm subjectId={person.id} />
            </div>
          )}
        </div>
      )}

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
                    {n.author.displayName
                      ? renderRedactedName(n.author.displayName, viewer)
                      : "UNKNOWN"}{" "}
                    —{" "}
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
