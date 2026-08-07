import { notFound } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import {
  getMentionCandidates,
  linkifyMentionNodes,
} from "@/lib/mentions";
import {
  renderRedacted,
  renderRedactedName,
  canBypassRedaction,
} from "@/lib/redact";
import { messageRetentionCutoff } from "@/lib/message-retention";
import { StationHead, HudPanel, Readout } from "@/components/hud";

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const anchor = await db.message.findUnique({ where: { id } });
  if (
    !anchor ||
    (anchor.senderId !== user.id && anchor.recipientId !== user.id)
  ) {
    notFound();
  }

  const threadKey = anchor.threadId ?? anchor.id;

  // All messages in the conversation the viewer is a party to.
  const thread = await db.message.findMany({
    where: {
      createdAt: { gte: messageRetentionCutoff() },
      OR: [{ threadId: threadKey }, { id: threadKey }],
      AND: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { displayName: true } },
      recipient: { select: { displayName: true } },
    },
  });

  if (thread.length === 0) notFound();

  const mentionCandidates = await getMentionCandidates();

  // Mark received messages in this conversation as read. Scheduled with after()
  // so the write (and its revalidatePath) runs once the response is sent —
  // mutating during render is not allowed and crashes the page.
  after(async () => {
    await db.message.updateMany({
      where: {
        recipientId: user.id,
        read: false,
        OR: [{ threadId: threadKey }, { id: threadKey }],
      },
      data: { read: true },
    });
  });

  const latest = thread[thread.length - 1];
  const otherPartyId =
    latest.senderId === user.id ? latest.recipientId : latest.senderId;
  const replySubject = latest.subject.startsWith("RE: ")
    ? latest.subject
    : `RE: ${latest.subject}`;
  const replyHref = `/messages/compose?to=${otherPartyId}&subject=${encodeURIComponent(
    replySubject
  )}&thread=${threadKey}`;

  return (
    <>
      <StationHead code="SEC-02 // THREAD" title={thread[0].subject}>
        <Readout label="Messages" value={thread.length} small />
        <Link href={replyHref} className="term-link text-sm">
          [REPLY]
        </Link>
        <Link href="/messages" className="term-link text-sm">
          [BACK]
        </Link>
      </StationHead>

      <HudPanel code="01" title="TRANSCRIPT">
      <div className="space-y-3">
        {thread.map((m) => {
          const mine = m.senderId === user.id;
          return (
            <div
              key={m.id}
              className="term-panel term-panel--sub space-y-2"
              // Outbound messages get the clearance accent on their edge so a
              // thread reads as a conversation at a glance.
              style={
                mine
                  ? { borderLeft: "2px solid var(--term-clearance)" }
                  : undefined
              }
            >
              <p className="hud-recid">
                FROM {renderRedactedName(m.sender.displayName ?? "", user)} → TO{" "}
                {renderRedactedName(m.recipient.displayName ?? "", user)} ·{" "}
                {m.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                {mine && " · SENT"}
              </p>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {linkifyMentionNodes(
                  renderRedacted(
                    m.body,
                    user.clearance,
                    canBypassRedaction(user)
                  ),
                  mentionCandidates
                )}
              </pre>
            </div>
          );
        })}
      </div>
      </HudPanel>
    </>
  );
}
