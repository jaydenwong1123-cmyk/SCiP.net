import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser, hasStaffPowers } from "@/lib/session";
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
        db.user.findMany({
          where: {
            displayName: { not: null },
            clearance: { lt: file.clearanceRequired },
          },
          orderBy: { displayName: "asc" },
          select: { id: true, displayName: true, clearance: true },
        }),
      ])
    : [[], []];

  return (
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: {file.title.toUpperCase()} ::
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {canEdit && (
            <Link href={`/scp/${file.id}/edit`} className="term-link">
              [AMEND]
            </Link>
          )}
          <Link href={`/scp/${file.id}/history`} className="term-link">
            [HISTORY{file.revisionCount > 0 ? ` (${file.revisionCount})` : ""}]
          </Link>
          <Link href="/scp" className="term-link">
            [BACK TO ARCHIVE]
          </Link>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--term-fg-dim)]">
        <ClassificationBadge classification={file.classification} size="lg" />
        <span>CLEARANCE REQUIRED: {clearanceLabel(file.clearanceRequired)}</span>
        <span>— AUTHOR: {renderRedactedName(file.author.displayName ?? "", user)}</span>
        {file.updatedAt && (
          <span>
            — REV {file.revisionCount}, AMENDED{" "}
            {file.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
          </span>
        )}
      </div>

      {activeGrant && (
        <p className="text-xs" style={{ color: "var(--term-amber)" }}>
          TEMPORARY ACCESS — EXPIRES{" "}
          {activeGrant.expiresAt.toISOString().slice(0, 16).replace("T", " ")}
        </p>
      )}

      <pre className="whitespace-pre-wrap break-words font-mono text-sm">
        {await renderBody(file.body, user)}
      </pre>

      <div className="pt-2 border-t border-[var(--term-border)]/30 space-y-3">
        <h2 className="text-sm tracking-widest text-[var(--term-fg-dim)]">
          EXPERIMENT LOGS{testLogs.length > 0 ? ` (${testLogs.length})` : ""}
        </h2>

        {renderedLogs.length === 0 && (
          <p className="text-xs text-[var(--term-fg-dim)]">
            NO EXPERIMENTS HAVE BEEN LOGGED AGAINST THIS ANOMALY.
          </p>
        )}

        {renderedLogs.map(({ log, procedure, result, notes }) => (
          <div
            key={log.id}
            className="border border-[var(--term-border)]/40 p-2 space-y-1 text-sm"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--term-fg-dim)]">
              <span className="text-[var(--term-fg-bright)]">
                TEST LOG {log.sequence}
              </span>
              <span>
                {log.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
              <span>
                — RESEARCHER:{" "}
                {renderRedactedName(log.authorName, user)}
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
              <div className="text-xs text-[var(--term-fg-dim)]">PROCEDURE:</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {procedure}
              </pre>
            </div>
            <div>
              <div className="text-xs text-[var(--term-fg-dim)]">RESULT:</div>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {result}
              </pre>
            </div>
            {notes && (
              <div>
                <div className="text-xs text-[var(--term-fg-dim)]">NOTE:</div>
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {notes}
                </pre>
              </div>
            )}
          </div>
        ))}

        {canAddTest && <TestLogForm scpFileId={file.id} />}
      </div>

      {canManage && (
        <div className="pt-2 border-t border-[var(--term-border)]/30 space-y-4">
          <div className="space-y-2">
            <h2 className="text-sm text-[var(--term-fg-dim)]">
              GRANT TEMPORARY ACCESS
            </h2>
            {members.length > 0 ? (
              <AccessForm scpFileId={file.id} members={members} />
            ) : (
              <p className="text-xs text-[var(--term-fg-dim)]">
                NO MEMBERS BELOW THIS FILE&apos;S CLEARANCE REQUIREMENT.
              </p>
            )}
          </div>

          {grants.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm text-[var(--term-fg-dim)]">ACTIVE GRANTS</h2>
              <ul className="space-y-1 text-xs">
                {grants.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 flex-wrap">
                    <span>
                      {g.user.displayName} — EXPIRES{" "}
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

          <form action={deleteScpFileAction} className="pt-2">
            <input type="hidden" name="id" value={file.id} />
            <button
              className="term-button text-xs"
              style={{ borderColor: "var(--term-red)", color: "var(--term-red)" }}
            >
              [DELETE FILE]
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
