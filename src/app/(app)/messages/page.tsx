import Link from "next/link";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";

export default async function MessagesPage() {
  const user = await requireUser();

  const [inbox, sent] = await Promise.all([
    db.message.findMany({
      where: { recipientId: user.id },
      orderBy: { createdAt: "desc" },
      include: { sender: { select: { displayName: true } } },
    }),
    db.message.findMany({
      where: { senderId: user.id },
      orderBy: { createdAt: "desc" },
      include: { recipient: { select: { displayName: true } } },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="term-panel flex items-center justify-between">
        <h1 className="text-lg tracking-widest">:: MESSAGE TERMINAL ::</h1>
        <Link href="/messages/compose" className="term-button text-sm">
          [+ COMPOSE]
        </Link>
      </div>

      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">INBOX</h2>
        {inbox.length === 0 && <p className="text-sm">NO MESSAGES.</p>}
        {inbox.map((m) => (
          <Link
            key={m.id}
            href={`/messages/${m.id}`}
            className="flex justify-between text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
          >
            <span>{m.read ? "" : "[NEW] "}{m.subject} — from {m.sender.displayName}</span>
            <span className="text-[var(--term-fg-dim)]">
              {m.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </Link>
        ))}
      </div>

      <div className="term-panel space-y-2">
        <h2 className="text-sm text-[var(--term-fg-dim)]">SENT</h2>
        {sent.length === 0 && <p className="text-sm">NO MESSAGES.</p>}
        {sent.map((m) => (
          <Link
            key={m.id}
            href={`/messages/${m.id}`}
            className="flex justify-between text-sm py-1 border-b border-[var(--term-border)]/30 term-link"
          >
            <span>{m.subject} — to {m.recipient.displayName}</span>
            <span className="text-[var(--term-fg-dim)]">
              {m.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
