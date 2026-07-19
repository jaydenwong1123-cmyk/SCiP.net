import Link from "next/link";
import { Fragment, isValidElement, type ReactNode } from "react";
import { db } from "@/lib/db";
import { clearanceLabel } from "@/lib/clearance";

// Auto-linking for "SCP-XXXX" mentions in document bodies.
//
// Two rules govern this, both about not leaking through the link:
//
//   1. A mention is only linked if a file with that designation exists *and*
//      the viewer is cleared to read it. A file above the viewer's clearance
//      renders as inert text with a restricted marker — never a link that
//      would 404 and thereby confirm the document exists.
//   2. Linking runs *after* redaction, over the visible text only. A mention
//      inside a redacted span is never turned into a link, which would
//      otherwise reveal the contents of a block the viewer cannot read.

// Matches SCP-173, SCP-4999, SCP-001. Case-insensitive, word-bounded so it
// doesn't fire inside a longer token.
const MENTION_RE = /\bSCP-\d{1,5}\b/gi;

export type ScpLinkTarget = {
  id: string;
  title: string;
  clearanceRequired: number;
};

// Map of normalized designation -> file, for every SCP mentioned in the given
// text. Resolved in one query rather than per mention.
export type ScpLinkMap = Map<string, ScpLinkTarget>;

export function collectMentions(...texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) {
    MENTION_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MENTION_RE.exec(text)) !== null) {
      found.add(m[0].toUpperCase());
    }
  }
  return [...found];
}

// Resolve mentions to SCP files by title.
//
// Titles are free text, so a file is matched when its title *starts with* the
// designation ("SCP-173" matches a file titled "SCP-173 — The Sculpture").
// Fetches only candidate rows and narrows in memory, since SQLite's LIKE
// cannot be relied on for a prefix match across arbitrary titles here.
export async function resolveScpLinks(
  mentions: string[]
): Promise<ScpLinkMap> {
  const map: ScpLinkMap = new Map();
  if (mentions.length === 0) return map;

  const candidates = await db.scpFile.findMany({
    where: {
      OR: mentions.map((m) => ({
        title: { startsWith: m },
      })),
    },
    select: { id: true, title: true, clearanceRequired: true },
  });

  for (const mention of mentions) {
    // Prefer an exact-designation match; fall back to the shortest title that
    // begins with it, so "SCP-17" cannot hijack "SCP-173".
    const matches = candidates
      .filter((c) => {
        const upper = c.title.toUpperCase();
        if (!upper.startsWith(mention)) return false;
        // The character after the designation must be a separator, not another
        // digit — otherwise SCP-17 would match "SCP-173".
        const next = upper.charAt(mention.length);
        return next === "" || !/\d/.test(next);
      })
      .sort((a, b) => a.title.length - b.title.length);

    if (matches[0]) map.set(mention, matches[0]);
  }

  return map;
}

// Turn SCP mentions inside a plain string into links, honoring clearance.
function linkifyString(
  text: string,
  links: ScpLinkMap,
  viewerClearance: number,
  keyPrefix: string
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  MENTION_RE.lastIndex = 0;
  while ((match = MENTION_RE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t${key++}`}>
          {text.slice(last, match.index)}
        </Fragment>
      );
    }

    const raw = match[0];
    const target = links.get(raw.toUpperCase());

    if (!target) {
      // No such file — leave the mention as ordinary text.
      nodes.push(<Fragment key={`${keyPrefix}-p${key++}`}>{raw}</Fragment>);
    } else if (target.clearanceRequired > viewerClearance) {
      // The file exists but is out of reach. Render inert, and say why,
      // without linking to something that would deny them.
      nodes.push(
        <span
          key={`${keyPrefix}-r${key++}`}
          className="scp-ref scp-ref--locked"
          title={`${raw} — REQUIRES ${clearanceLabel(target.clearanceRequired)}`}
        >
          {raw}
          <span aria-hidden> ⧗</span>
          <span className="sr-only">
            {" "}
            (restricted, requires {clearanceLabel(target.clearanceRequired)})
          </span>
        </span>
      );
    } else {
      nodes.push(
        <Link
          key={`${keyPrefix}-l${key++}`}
          href={`/scp/${target.id}`}
          className="scp-ref scp-ref--live"
          title={target.title}
        >
          {raw}
        </Link>
      );
    }

    last = match.index + raw.length;
  }

  if (last < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-t${key++}`}>{text.slice(last)}</Fragment>
    );
  }

  return nodes;
}

// Walk the output of renderRedacted and linkify only the plain-text parts.
//
// Redacted spans arrive as elements rather than strings, so they are passed
// through untouched — a mention hidden behind a redaction stays hidden.
export function linkifyNodes(
  nodes: ReactNode[],
  links: ScpLinkMap,
  viewerClearance: number
): ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === "string") {
      return (
        <Fragment key={`s${i}`}>
          {linkifyString(node, links, viewerClearance, `s${i}`)}
        </Fragment>
      );
    }

    // renderRedacted emits visible text as <Fragment>{string}</Fragment> and
    // hidden text as a <span class="redacted">. Reach through the Fragment to
    // linkify the text inside it, but *only* a Fragment — matching on "any
    // element whose children is a string" would also swallow the redaction
    // span, dropping its styling and tooltip along with it.
    if (isValidElement(node) && node.type === Fragment) {
      const child = (node.props as { children?: unknown }).children;
      if (typeof child === "string") {
        return (
          <Fragment key={`f${i}`}>
            {linkifyString(child, links, viewerClearance, `f${i}`)}
          </Fragment>
        );
      }
    }

    // Redaction spans and anything else pass through untouched.
    return <Fragment key={`o${i}`}>{node}</Fragment>;
  });
}
