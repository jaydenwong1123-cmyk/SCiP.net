import { db } from "@/lib/db";

// Attachments are stored as rows in the database. Secure-channel attachments
// expire 14 days after upload; personnel-dossier evidence is permanent (a null
// `expiresAt`) because it backs disciplinary records that outlive the window.
// Two mechanisms enforce expiry, deliberately:
//
//   1. Every read filters on `expiresAt`, so a lapsed file stops being served
//      the instant it expires.
//   2. A sweeper deletes expired rows to reclaim space.
//
// (1) is the security/correctness guarantee and does not depend on (2) having
// run. (2) is only housekeeping. There is no cron in this deployment, so the
// sweep runs opportunistically on a small fraction of requests.

export const ATTACHMENT_ENTITIES = {
  secure: "secure",
  personnel: "personnel",
} as const;

export type AttachmentEntity =
  (typeof ATTACHMENT_ENTITIES)[keyof typeof ATTACHMENT_ENTITIES];

export const ATTACHMENT_TTL_DAYS = 14;
const TTL_MS = ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000;

// 512KB. Server Actions cap request bodies at 1MB by default, and multipart
// framing adds overhead on top of the file itself, so this leaves headroom
// without needing to raise the limit.
export const MAX_ATTACHMENT_BYTES = 512 * 1024;

// Minimum clearance to attach to (or view attachments on) a personnel file.
export const PERSONNEL_ATTACH_CLEARANCE = 5;

// At most one file may ride along with a single message/transmission. The
// forms omit `multiple`, but the cap is enforced server-side too since a
// crafted request can post the field more than once.
export const MAX_ATTACHMENTS_PER_MESSAGE = 1;

// How many non-empty files a form actually carried under `field`.
export function countUploads(formData: FormData, field = "attachment"): number {
  return formData
    .getAll(field)
    .filter((v) => v instanceof File && v.size > 0).length;
}

// Only raster images are accepted. Anything script-bearing — notably SVG,
// which can carry inline JavaScript — is deliberately excluded.
const SIGNATURES: { mime: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  {
    mime: "image/png",
    ext: "png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    mime: "image/jpeg",
    ext: "jpg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    ext: "gif",
    test: (b) =>
      b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  },
  {
    mime: "image/webp",
    ext: "webp",
    // "RIFF" .... "WEBP"
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

export const ACCEPTED_MIME = SIGNATURES.map((s) => s.mime).join(",");
export const ACCEPTED_LABEL = "PNG / JPEG / GIF / WEBP";

export type ValidatedFile = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  size: number;
};

export type ValidationResult =
  | { ok: true; file: ValidatedFile }
  | { ok: false; error: string };

// Validate an uploaded file by inspecting its actual leading bytes.
//
// The browser-supplied `type` and the filename extension are both attacker
// controlled and are never trusted; the stored mime type comes from the magic
// number instead. This is what stops someone uploading an HTML or SVG payload
// renamed to .png and having it served back with a type that a browser would
// execute.
export async function validateUpload(value: unknown): Promise<ValidationResult> {
  if (!(value instanceof File) || value.size === 0) {
    return { ok: false, error: "NO FILE RECEIVED." };
  }
  if (value.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: `FILE EXCEEDS ${Math.floor(MAX_ATTACHMENT_BYTES / 1024)}KB LIMIT.`,
    };
  }

  const bytes = new Uint8Array(await value.arrayBuffer());
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "FILE EXCEEDS SIZE LIMIT." };
  }

  const match = SIGNATURES.find((s) => s.test(bytes));
  if (!match) {
    return {
      ok: false,
      error: `UNSUPPORTED FORMAT. ACCEPTED: ${ACCEPTED_LABEL}.`,
    };
  }

  // Rebuild the filename from a conservative allowlist rather than trying to
  // strip dangerous sequences. The name is only ever used for display and the
  // Content-Disposition header — never as a filesystem path — but a crafted
  // value like "../../etc/passwd" should still not survive into the UI.
  // The extension is then set from the verified signature, not the input.
  const base = (value.name || "upload")
    .replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return {
    ok: true,
    file: {
      bytes,
      mimeType: match.mime,
      filename: `${base || "upload"}.${match.ext}`,
      size: bytes.length,
    },
  };
}

export async function storeAttachment(args: {
  entityType: AttachmentEntity;
  entityId: string;
  file: ValidatedFile;
  uploader: { id: string; displayName: string | null; email: string };
}): Promise<void> {
  await db.attachment.create({
    data: {
      entityType: args.entityType,
      entityId: args.entityId,
      filename: args.file.filename,
      mimeType: args.file.mimeType,
      size: args.file.size,
      data: Buffer.from(args.file.bytes),
      expiresAt:
        args.entityType === ATTACHMENT_ENTITIES.personnel
          ? null
          : new Date(Date.now() + TTL_MS),
      uploaderId: args.uploader.id,
      uploaderName: args.uploader.displayName ?? args.uploader.email,
    },
  });
}

// Metadata for the attachments still live on a set of records. The `data`
// column is deliberately excluded — the bytes are only ever loaded by the
// serving route, never while rendering a list.
export async function listAttachments(
  entityType: AttachmentEntity,
  entityIds: string[]
) {
  if (entityIds.length === 0) return [];
  return db.attachment.findMany({
    where: {
      entityType,
      entityId: { in: entityIds },
      // Null = never expires.
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: {
      id: true,
      entityId: true,
      filename: true,
      mimeType: true,
      size: true,
      createdAt: true,
      expiresAt: true,
      uploaderId: true,
      uploaderName: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

// Group a flat attachment list by the record it belongs to.
export function groupByEntity<T extends { entityId: string }>(
  rows: T[]
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const existing = map.get(row.entityId);
    if (existing) existing.push(row);
    else map.set(row.entityId, [row]);
  }
  return map;
}

export async function deleteAttachmentsFor(
  entityType: AttachmentEntity,
  entityId: string
): Promise<void> {
  await db.attachment.deleteMany({ where: { entityType, entityId } });
}

// Housekeeping sweep for lapsed rows. Reads already exclude expired files, so
// this only reclaims space and is safe to run rarely or not at all.
export async function pruneExpiredAttachments(probability = 0.05): Promise<void> {
  if (Math.random() > probability) return;
  try {
    await db.attachment.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  } catch {
    /* best-effort */
  }
}

// "3 DAYS" / "5 HOURS" / "12 MIN" until an attachment lapses.
export function formatRemaining(expiresAt: Date | null): string {
  if (!expiresAt) return "NEVER";
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return "EXPIRED";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} MIN`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} HOUR${hours === 1 ? "" : "S"}`;
  const days = Math.floor(hours / 24);
  return `${days} DAY${days === 1 ? "" : "S"}`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}
