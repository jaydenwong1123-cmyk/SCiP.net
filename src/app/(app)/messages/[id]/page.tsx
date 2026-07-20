import { notFound } from "next/navigation";
import { after } from "next/server";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getMentionCandidates, linkifyMentions } from "@/lib/mentions";

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
    <div className="term-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg tracking-widest break-words">
          :: {thread[0].subject} ::
        </h1>
        <div className="flex items-center gap-4 shrink-0">
          <Link href={replyHref} className="term-link text-sm">
            [REPLY]
          </Link>
          <Link href="/messages" className="term-link text-sm">
            [BACK]
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {thread.map((m) => {
          const mine = m.senderId === user.id;
          return (
            <div
              key={m.id}
              className="border border-[var(--term-border)]/40 p-3 space-y-2"
            >
              <p className="text-xs text-[var(--term-fg-dim)]">
                FROM: {m.sender.displayName} → TO: {m.recipient.displayName} —{" "}
                {m.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                {mine && " · SENT"}
              </p>
              <pre className="whitespace-pre-wrap break-words font-mono text-sm">
                {linkifyMentions(m.body, mentionCandidates)}
              </pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}
