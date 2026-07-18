import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { markReadAction } from "../actions";

export default async function MessageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  const message = await db.message.findUnique({
    where: { id },
    include: {
      sender: { select: { displayName: true } },
      recipient: { select: { displayName: true } },
    },
  });

  if (!message || (message.senderId !== user.id && message.recipientId !== user.id)) {
    notFound();
  }

  if (message.recipientId === user.id && !message.read) {
    await markReadAction(message.id);
  }

  // Reply goes to the other party in the thread.
  const otherPartyId =
    message.senderId === user.id ? message.recipientId : message.senderId;
  const replySubject = message.subject.startsWith("RE: ")
    ? message.subject
    : `RE: ${message.subject}`;
  const replyHref = `/messages/compose?to=${otherPartyId}&subject=${encodeURIComponent(replySubject)}`;

  return (
    <div className="term-panel space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg tracking-widest">:: MESSAGE ::</h1>
        <div className="flex items-center gap-4">
          <Link href={replyHref} className="term-link text-sm">
            [REPLY]
          </Link>
          <Link href="/messages" className="term-link text-sm">
            [BACK]
          </Link>
        </div>
      </div>
      <p className="text-sm text-[var(--term-fg-dim)]">
        FROM: {message.sender.displayName} — TO: {message.recipient.displayName} —{" "}
        {message.createdAt.toISOString().slice(0, 16).replace("T", " ")}
      </p>
      <p className="font-bold break-words">{message.subject}</p>
      <pre className="whitespace-pre-wrap break-words font-mono text-sm">{message.body}</pre>
    </div>
  );
}
