import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { clearanceLabel, canAccessSecureChannel } from "@/lib/clearance";
import { SecureForm } from "./secure-form";

export default async function SecureChannelPage() {
  const user = await requireUser();
  if (!canAccessSecureChannel(user.clearance)) redirect("/personnel");

  const messages = await db.secureMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      author: { select: { displayName: true, clearance: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div className="secure-panel space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg tracking-widest text-[var(--term-amber)]">
            :: ENCRYPTED CHANNEL // L-5+ EYES ONLY ::
          </h1>
          <span className="secure-badge text-xs">● AES-256 SECURE LINK</span>
        </div>
        <p className="text-xs text-[var(--term-fg-dim)]">
          END-TO-END ENCRYPTED · ACCESS: {clearanceLabel(user.clearance)} ·
          UNAUTHORIZED INTERCEPTION IS A CLASS-4 INFRACTION · ALL TRAFFIC LOGGED
        </p>
      </div>

      <div className="secure-panel">
        <SecureForm />
      </div>

      <div className="secure-panel space-y-3">
        <h2 className="text-xs text-[var(--term-fg-dim)] tracking-widest">
          ▼ TRANSMISSION LOG
        </h2>
        {messages.length === 0 && (
          <p className="text-sm">NO TRANSMISSIONS ON RECORD.</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className="border-l-2 border-[var(--term-amber)]/50 pl-3 py-1 space-y-1"
          >
            <p className="text-xs text-[var(--term-fg-dim)]">
              <span className="text-[var(--term-amber)]">
                [{clearanceLabel(m.author.clearance)}] {m.author.displayName}
              </span>{" "}
              · {m.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-sm">
              {m.body}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
