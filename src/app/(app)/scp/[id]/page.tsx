import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasStaffPowers, hasAdminPowers } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";
import {
  canEditScpFile,
  canLogScpTest,
  canDeleteScpTest,
} from "@/lib/doc-permissions";
import { renderBody } from "@/lib/render-body";
import { renderRedactedName } from "@/lib/redact";
import { ClassificationBadge } from "@/components/signal-badge";
import {
  deleteScpFileAction,
  revokeScpAccessAction,
  deleteScpTestLogAction,
} from "../actions";
import { AccessForm } from "./access-form";
import { TestLogForm } from "./test-log-form";
import {
  StationHead,
  HudPanel,
  Lamp,
  TickRule,
  EmptyState,
} from "@/components/hud";

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

  if (!file) notFound();

  const hasClearance = file.clearanceRequired <= user.clearance;
  const activeGrant = hasClearance
    ? null
    : await db.scpAccessGrant.findFirst({
        where: {
          scpFileId: file.id,
          userId: user.id,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

  if (!hasClearance && !activeGrant) notFound();

  const canManage = hasStaffPowers(user);
  // Issuing a temporary grant is Admin and above; Staff still see the active
  // grants and may revoke them.
  const canGrantAccess = hasAdminPowers(user);
  // Prior versions of a file are Admin and above; the history page re-checks.
  const canViewHistory = hasAdminPowers(user);
  const canEdit = canEditScpFile(user, file);
  const canAddTest = canLogScpTest(user);

  const testLogs = await db.scpTestLog.findMany({
    where: { scpFileId: file.id },
    orderBy: { sequence: "asc" },
  });

  // `renderBody` is async (it resolves SCP cross-links), so the three fields of
  // every log are rendered up front rather than awaited inside the JSX map.
  const renderedLogs = await Promise.all(
    testLogs.map(async (log) => ({
      log,
      procedure: await renderBody(log.procedure, user),
      result: await renderBody(log.result, user),
      notes: log.notes ? await renderBody(log.notes, user) : null,
    }))
  );

  const [grants, members] = canManage
    ? await Promise.all([
        db.scpAccessGrant.findMany({
          where: { scpFileId: file.id, revokedAt: null, expiresAt: { gt: new Date() } },
          include: { user: { select: { displayName: true } } },
          orderBy: { expiresAt: "asc" },
        }),
        canGrantAccess
          ? db.user.findMany({
              where: {
                displayName: { not: null },
                clearance: { lt: file.clearanceRequired },
              },
              orderBy: { displayName: "asc" },
              select: { id: true, displayName: true, clearance: true },
            })
          : [],
      ])
    : [[], []];

  return (
    <>
      <StationHead
        code="SEC-03 // CONTAINMENT RECORD"
        title={file.title.toUpperCase()}
      >
        {canEdit && (
          <Link href={`/scp/${file.id}/edit`} className="term-link text-sm">
            [EDIT]
          </Link>
        )}
        {canViewHistory && (
          <Link href={`/scp/${file.id}/history`} className="term-link text-sm">
            [HISTORY{file.revisionCount > 0 ? ` (${file.revisionCount})` : ""}]
          </Link>
        )}
        <Link href="/scp" className="term-link text-sm">
          [BACK TO ARCHIVE]
        </Link>
      </StationHead>

      {/* Containment record header: the identifying facts as a hairline field
          grid, above the prose rather than mixed into it. */}
      <div className="hud-fields">
        <div>
          <div className="hud-readout__label">Item #</div>
          <div className="hud-recid mt-1 text-[var(--term-fg-bright)]">
            SCP-{String(file.id).slice(0, 4).toUpperCase()}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Object Class</div>
          <div className="mt-1">
            <ClassificationBadge classification={file.classification} />
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Clearance Required</div>
          <div className="clearance-chip inline-block mt-1 text-xs">
            {clearanceLabel(file.clearanceRequired)}
          </div>
        </div>
        <div>
          <div className="hud-readout__label">Classified By</div>
          <div className="text-sm mt-1">
            {renderRedactedName(file.author.displayName ?? "", user)}
          </div>
        </div>
        {file.updatedAt && (
          <div>
            <div className="hud-readout__label">Revision</div>
            <div className="hud-recid mt-1">
              REV {file.revisionCount} ·{" "}
              {file.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
            </div>
          </div>
        )}
      </div>

      {activeGrant && (
        <div className="hud-banner hud-banner--alert">
          ⧗ TEMPORARY ACCESS — EXPIRES{" "}
          {activeGrant.expiresAt.toISOString().slice(0, 16).replace("T", " ")}
        </div>
      )}

      <HudPanel code="01" title="FILE BODY">
        <pre className="whitespace-pre-wrap break-words font-mono text-sm">
          {await renderBody(file.body, user)}
        </pre>
      </HudPanel>

      <HudPanel
        code="02"
        title="EXPERIMENT LOGS"
        status={`${testLogs.length} LOGGED`}
      >
        {renderedLogs.length === 0 && (
          <EmptyState glyph="○" title="No experiments logged">
            <p className="text-xs">
              NOTHING HAS BEEN LOGGED AGAINST THIS ANOMALY.
            </p>
          </EmptyState>
        )}

        {renderedLogs.map(({ log, procedure, result, notes }) => (
          <div
            key={log.id}
            className="term-panel term-panel--sub space-y-1 text-sm mb-2"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="hud-recid text-[var(--term-fg-bright)]">
                TEST LOG {log.sequence}
              </span>
              <span className="hud-recid">
                {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
              <span className="hud-recid">
                RESEARCHER: {renderRedactedName(log.authorName, user)}
              </span>
              {canDeleteScpTest(user, log) && (
                <form action={deleteScpTestLogAction} className="ml-auto">
                  <input type="hidden" name="logId" value={log.id} />
                  <button
                    className="term-link"
                    style={{ color: "var(--term-red)" }}
                  >
                    [RETRACT]
                  </button>
                </form>
              )}
            </div>
            <div>
              <div className="hud-readout__label">PROCEDURE</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {procedure}
              </pre>
            </div>
            <div>
              <div className="hud-readout__label">RESULT</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {result}
              </pre>
            </div>
            {notes && (
              <div>
                <div className="hud-readout__label">NOTE</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {notes}
                </pre>
              </div>
            )}
          </div>
        ))}

        {canAddTest && (
          <>
            <TickRule className="my-3" />
            <TestLogForm scpFileId={file.id} />
          </>
        )}
      </HudPanel>

      {canManage && (
        <HudPanel code="03" title="ACCESS CONTROL" status="CUSTODIAN ONLY">
          {canGrantAccess && (
            <div className="space-y-2">
              <h3 className="hud-readout__label">GRANT TEMPORARY ACCESS</h3>
              {members.length > 0 ? (
                <AccessForm scpFileId={file.id} members={members} />
              ) : (
                <p className="text-xs text-[var(--term-fg-dim)]">
                  NO MEMBERS BELOW THIS FILE&apos;S CLEARANCE REQUIREMENT.
                </p>
              )}
            </div>
          )}

          {grants.length > 0 && (
            <div className="space-y-2 pt-3">
              <TickRule />
              <h3 className="hud-readout__label pt-1">ACTIVE GRANTS</h3>
              <ul className="hud-list text-xs">
                {grants.map((g) => (
                  <li
                    key={g.id}
                    className="term-row flex items-center gap-2 flex-wrap"
                  >
                    <Lamp state="warn">GRANTED</Lamp>
                    <span>{g.user.displayName}</span>
                    <span className="hud-recid">
                      EXPIRES{" "}
                      {g.expiresAt.toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                    <form action={revokeScpAccessAction}>
                      <input type="hidden" name="grantId" value={g.id} />
                      <button
                        className="term-link"
                        style={{ color: "var(--term-red)" }}
                      >
                        [REVOKE]
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <TickRule className="my-3" />
          <form action={deleteScpFileAction}>
            <input type="hidden" name="id" value={file.id} />
            <button className="term-button term-button--danger term-button--sm">
              DELETE FILE
            </button>
          </form>
        </HudPanel>
      )}
    </>
  );
}
