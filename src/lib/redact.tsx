import { Fragment, type ReactNode } from "react";

// Redaction markup:
//   [*SECRET*]        -> always redacted (white box), nobody can read it
//   [*SECRET*][3]     -> only viewers with clearance >= 3 see "SECRET";
//                        everyone below sees a redacted white box
//
// Redaction is resolved on the server so hidden text is never sent to a
// browser that isn't cleared to read it.
const REDACT_RE = /\[\*([\s\S]+?)\*\](?:\[(\d+)\])?/g;

export function renderRedacted(
  text: string,
  viewerClearance: number
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  REDACT_RE.lastIndex = 0;
  while ((match = REDACT_RE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    }

    const content = match[1];
    const level = match[2] ? parseInt(match[2], 10) : null;
    const canSee = level !== null && viewerClearance >= level;

    if (canSee) {
      nodes.push(<Fragment key={key++}>{content}</Fragment>);
    } else {
      // Never emit the hidden content — only a same-width block of characters.
      const width = Math.min(Math.max(content.length, 3), 60);
      nodes.push(
        <span
          key={key++}
          className="redacted"
          title={level !== null ? `[REDACTED — REQUIRES L-${level}]` : "[REDACTED]"}
        >
          {"█".repeat(width)}
        </span>
      );
    }

    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  }

  return nodes;
}
