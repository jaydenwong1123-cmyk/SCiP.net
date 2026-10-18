import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  clearanceDisplay,
  canAccessSecureChannel, clearanceChipStyle } from "@/lib/clearance";
import {
  renderRedacted,
  renderRedactedName,
  canBypassRedaction,
} from "@/lib/redact";
import { SecureForm } from "./secure-form";
import { AttachmentList } from "@/components/attachment-list";
import {
  StationHead,
  HudPanel,
  HudBanner,
  Readout,
  EmptyState,
} from "@/components/hud";
import {
  ATTACHMENT_ENTITIES,
  listAttachments,
  groupByEntity,
} from "@/lib/attachments";

export default async function SecureChannelPage() {
  const user = await requireUser();
  if (!canAccessSecureChannel(user.clearance)) redirect("/personnel");

  const messages = await db.secureMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      author: { select: { displayName: true, clearance: true, designation: true } },
    },
  });

  // Attachment metadata for the visible transmissions, fetched in one query
  // and grouped by message. The bytes are not loaded here — only the serving
  // route reads those.
  const attachments = groupByEntity(
    await listAttachments(
      ATTACHMENT_ENTITIES.secure,
      messages.map((m) => m.id)
    )
  );

  return (
    <>
      <HudBanner level="secret">
        SECRET // AES-256 // L-6+ EYES ONLY // ALL TRAFFIC LOGGED
      </HudBanner>

      <StationHead
        code="L-6+ // ENCRYPTED CHANNEL"
        title={<span className="text-[var(--term-amber)]">SECURE CHANNEL</span>}
      >
        <Readout label="Transmissions" value={messages.length} tone="amber" />
        <Readout
          label="Your Access"
          value={clearanceDisplay(user.clearance, user.designation)}
          small
        />
        <span className="secure-badge text-xs">● SECURE LINK</span>
      </StationHead>

      <p className="text-[10px] text-[var(--term-fg-dim)]">
        END-TO-END ENCRYPTED · UNAUTHORIZED INTERCEPTION IS A CLASS-4 INFRACTION
      </p>

      <HudPanel code="01" title="TRANSMIT" variant="secure">
        <SecureForm />
      </HudPanel>

      <HudPanel
        code="02"
        title="TRANSMISSION LOG"
        status={`${messages.length} ON RECORD`}
        variant="secure"
      >
        <div className="hud-list">
          {messages.length === 0 && (
            <EmptyState glyph="⚿" title="No transmissions on record" />
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className="term-row space-y-1"
              style={{
                borderLeft: "2px solid color-mix(in srgb, var(--term-amber) 50%, transparent)",
                paddingLeft: "0.75rem",
              }}
            >
              <p className="text-xs flex flex-wrap items-center gap-2">
                <span className="clearance-chip text-[10px]" style={clearanceChipStyle(m.author.clearance)}>
                  {clearanceDisplay(m.author.clearance, m.author.designation)}
                </span>
                <span className="text-[var(--term-amber)]">
                  {renderRedactedName(m.author.displayName ?? "", user)}
                </span>
                <span className="hud-recid">
                  {m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </p>
              {m.body && (
                <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                  {renderRedacted(m.body, user.clearance, canBypassRedaction(user))}
                </pre>
              )}
              <AttachmentList attachments={attachments.get(m.id) ?? []} />
            </div>
          ))}
        </div>
      </HudPanel>
    </>
  );
}
