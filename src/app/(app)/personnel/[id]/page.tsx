import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import {
  requireUser,
  canAnnotateMembers,
  hasStaffPowers,
  canEditAnyPersonalFile,
  canGrantTrainingAccess,
  hasHelperPowers,
} from "@/lib/session";
import { clearanceDisplay, clearanceChipStyle } from "@/lib/clearance";
import { renderBody } from "@/lib/render-body";
import {
  addMemberNoteAction,
  deleteMemberNoteAction,
  deletePersonnelAttachmentAction,
  deleteInfractionAction,
  toggleTrainingAccessAction,
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
import { SeverityMeter } from "@/components/signal-badge";
import {
  StationHead,
  HudPanel,
  Lamp,
  TickRule,
  EmptyState,
} from "@/components/hud";

export default async function PersonnelFilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await requireUser();
  const { id } = await params;
  const person = await db.user.findUnique({
    where: { id, isInsurgent: false },
    select: {
      id: true,
      displayName: true,
      clearance: true,
      designation: true,
      personalFile: true,
      isOwner: true,
      isCoOwner: true,
      isAdmin: true,
      isStaff: true,
      isHelper: true,
      canAccessTraining: true,
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

  // Dossier attachments are L-6+ material: the same bar gates uploading,
  // listing, and the route that serves the bytes.
  const canSeeAttachments = viewer.clearance >= PERSONNEL_ATTACH_CLEARANCE;

  // Training range grant: RAISA administrators (and Admin+) may open the range
  // to anyone but themselves. A member at Helper or above reaches it by role,
  // so for them the grant changes nothing and the panel says so.
  const showTrainingGrant =
    canGrantTrainingAccess(viewer) && viewer.id !== person.id;
  const trainingByRole = hasHelperPowers(person);
  const attachments = canSeeAttachments
    ? await listAttachments(ATTACHMENT_ENTITIES.personnel, [person.id])
    : [];

  return (
    <>
      <StationHead
        code="SEC-01 // PERSONNEL FILE"
        title={(viewer.id === person.id
          ? person.displayName
          : redactNameToText(person.displayName, viewer)
        ).toUpperCase()}
      >
        <Link href="/personnel" className="term-link text-sm">
          [BACK TO ROSTER]
        </Link>
      </StationHead>

      {/* Identity block above the file body: the facts a reader needs before
          the prose, laid out as a hairline field grid. */}
      <div className="hud-fields">
        <div>
          <div className="hud-readout__label">Clearance</div>
          <div className="clearance-chip inline-block mt-1 text-xs" style={clearanceChipStyle(person.clearance)}>
            {clearanceDisplay(person.clearance, person.designation)}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Record ID</div>
          <div className="hud-recid mt-1">
            ID-{String(person.id).slice(0, 8).toUpperCase()}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">File Status</div>
          <div className="mt-1">
            <Lamp state={person.personalFile ? "on" : "off"}>
              {person.personalFile ? "ON RECORD" : "NO FILE"}
            </Lamp>
          </div>
        </div>
      </div>

      <HudPanel code="01" title="PERSONAL FILE">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm term-panel term-panel--sub min-h-[10rem]">
          {person.personalFile
            ? await renderBody(person.personalFile, viewer)
            : "[NO FILE ON RECORD]"}
        </pre>
        {canEditAnyPersonalFile(viewer) && viewer.id !== person.id && (
          <div className="space-y-2 pt-3">
            <TickRule />
            <p className="hud-readout__label text-[var(--term-amber)] pt-1">
              ⧉ RECORDKEEPING — EDIT THIS FILE
            </p>
            <ProfileForm
              initialContent={person.personalFile ?? ""}
              subjectId={person.id}
            />
          </div>
        )}
      </HudPanel>

      {canSeeAttachments && (
        <HudPanel
          code="02"
          title={<span className="text-[var(--term-amber)]">⧉ ATTACHED EVIDENCE</span>}
          status="L-6+ ONLY"
          variant="secure"
        >
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
                      <button className="term-button term-button--danger term-button--sm">
                        REMOVE {a.filename}
                      </button>
                    </form>
                  ))}
              </div>
            </div>
          )}
          <TickRule className="my-3" />
          <PersonnelAttachmentForm subjectId={person.id} />
        </HudPanel>
      )}

      {canSeeInfractions && (
        <HudPanel
          code="03"
          title={<span className="text-[var(--term-amber)]">⚠ DISCIPLINARY RECORD</span>}
          status={`${infractions.length} ON FILE`}
        >
          <div className="hud-list">
            {infractions.length === 0 && (
              <EmptyState glyph="○" title="No infractions on record" />
            )}
            {infractions.map((inf) => {
              const color =
                INFRACTION_SEVERITY_COLOR[inf.severity as InfractionSeverity] ??
                "var(--term-fg-dim)";
              return (
                <div
                  key={inf.id}
                  className="term-row py-2 space-y-1"
                  style={{ borderLeft: `3px solid ${color}`, paddingLeft: "0.6rem" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-2 flex-wrap">
                      <SeverityMeter severity={inf.severity as InfractionSeverity} />
                      <span style={{ color }}>{inf.severity}</span>
                      <span className="hud-recid">
                        {inf.issuerName
                          ? renderRedactedName(inf.issuerName, viewer)
                          : "UNKNOWN"}{" "}
                        ·{" "}
                        {inf.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      </span>
                    </span>
                    {(canDeleteAny || inf.issuerId === viewer.id) && (
                      <form action={deleteInfractionAction}>
                        <input type="hidden" name="infractionId" value={inf.id} />
                        <button className="term-button term-button--danger term-button--sm">
                          DELETE
                        </button>
                      </form>
                    )}
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                    {inf.reason}
                  </pre>
                </div>
              );
            })}
          </div>

          {canFileInfractions && viewer.id !== person.id && (
            <>
              <TickRule className="my-3" />
              <InfractionForm subjectId={person.id} />
            </>
          )}
        </HudPanel>
      )}

      {showNotes && (
        <HudPanel
          code="04"
          title={
            <span className="text-[var(--term-amber)]">
              ⚑ CLASSIFIED PERSONNEL NOTES
            </span>
          }
          status="L-6+ / STAFF ONLY"
          variant="secure"
        >
          <p className="text-[10px] text-[var(--term-fg-dim)] mb-2">
            THIS SUBJECT CANNOT SEE THIS SECTION.
          </p>

          <div className="hud-list">
            {notes.length === 0 && (
              <EmptyState glyph="⚑" title="No notes on record" />
            )}
            {notes.map((n) => (
              <div
                key={n.id}
                className="term-row py-2 space-y-1"
                style={
                  n.flagged
                    ? { borderLeft: "3px solid var(--term-red)", paddingLeft: "0.6rem" }
                    : undefined
                }
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 flex-wrap">
                    {n.flagged && (
                      <span className="text-[var(--term-red)]">⚑ FLAGGED</span>
                    )}
                    <span>
                      {n.author.displayName
                        ? renderRedactedName(n.author.displayName, viewer)
                        : "UNKNOWN"}
                    </span>
                    <span className="hud-recid">
                      {n.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </span>
                  {(canDeleteAny || n.authorId === viewer.id) && (
                    <form action={deleteMemberNoteAction}>
                      <input type="hidden" name="noteId" value={n.id} />
                      <button className="term-button term-button--danger term-button--sm">
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

          <TickRule className="my-3" />
          <form action={addMemberNoteAction} className="space-y-2">
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
              <button className="term-button term-button--sm">ADD NOTE</button>
            </div>
          </form>
        </HudPanel>
      )}

      {showTrainingGrant && (
        <HudPanel
          code="05"
          title={<span className="text-[var(--term-amber)]">⧉ TRAINING RANGE ACCESS</span>}
          status="RAISA"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Lamp
              state={trainingByRole || person.canAccessTraining ? "on" : "off"}
            >
              {trainingByRole
                ? "CLEARED BY ROLE"
                : person.canAccessTraining
                  ? "CLEARED BY GRANT"
                  : "NOT CLEARED"}
            </Lamp>
            <form action={toggleTrainingAccessAction}>
              <input type="hidden" name="subjectId" value={person.id} />
              <input
                type="hidden"
                name="canAccessTraining"
                value={(!person.canAccessTraining).toString()}
              />
              <button
                className={`term-button term-button--sm${
                  person.canAccessTraining ? " term-button--danger" : ""
                }`}
              >
                {person.canAccessTraining ? "REVOKE ACCESS" : "GRANT ACCESS"}
              </button>
            </form>
          </div>
          <p className="text-[10px] text-[var(--term-fg-dim)] mt-2">
            {trainingByRole
              ? "THIS MEMBER HOLDS HELPER OR ABOVE AND REACHES THE RANGE REGARDLESS OF THIS GRANT."
              : "THE RANGE IS SIMULATION ONLY: NO CLEARANCE, NO COOLDOWN, NO CONDUCT RECORD."}
          </p>
        </HudPanel>
      )}
    </>
  );
}
