import Link from "next/link";
import { notFound } from "next/navigation";
import { requireInsurgent } from "@/lib/session";
import { db } from "@/lib/db";
import { renderRedacted } from "@/lib/redact";
import { formatNodes } from "@/lib/format";
import { clearanceLabel } from "@/lib/clearance";
import { formatDuration } from "@/lib/hack/config";
import { leakFor } from "@/lib/ci/siege-store";
import { HudPanel } from "@/components/hud";

// The one file a winning siege hands to Chaos Insurgency.
//
// Rendered at the leak's own tier, so anything redacted above it stays
// redacted. The body goes through renderRedacted + formatNodes only — NOT
// renderBody, whose SCP cross-linking would surface the titles of other files
// the operative has no business knowing exist. No author, no test logs, no
// attachments: the file text and nothing around it.
export default async function LeakPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireInsurgent();
  const { id } = await params;

  const leak = await leakFor(user.id, id);
  if (!leak) {
    return (
      <HudPanel code="XX" title="UPLINK SEVERED" status="NO SIGNAL" variant="alert">
        <p className="text-sm">The intercept window has closed, or this file was never yours.</p>
        <Link href="/insurgency" className="term-link text-sm">
          [BACK TO UPLINK]
        </Link>
      </HudPanel>
    );
  }

  const file = await db.scpFile.findUnique({
    where: { id: leak.scpFileId },
    select: { title: true, classification: true, clearanceRequired: true, body: true },
  });
  if (!file) notFound();

  // eslint-disable-next-line react-hooks/purity -- server component; single read of wall-clock
  const remaining = leak.expiresAt.getTime() - Date.now();

  return (
    <>
      <HudPanel
        code="!!"
        title={`INTERCEPT // ${file.title}`}
        status={`${clearanceLabel(file.clearanceRequired)} · DROPS IN ${formatDuration(remaining)}`}
        variant="alert"
      >
        <p className="text-xs text-[var(--term-fg-dim)] mb-3">
          CLASS: {file.classification.toUpperCase()} — READ IT NOW. THIS COPY WILL NOT BE HERE LATER.
        </p>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {formatNodes(renderRedacted(file.body, leak.tier, false))}
        </div>
      </HudPanel>
      <Link href="/insurgency" className="term-link text-sm">
        [BACK TO UPLINK]
      </Link>
    </>
  );
}
