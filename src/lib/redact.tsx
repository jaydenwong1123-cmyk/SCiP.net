import { Fragment, type ReactNode } from "react";
import {
  parseClearanceToken,
  clearanceLabel,
  OWNER_CLEARANCE,
} from "@/lib/clearance";

// Viewers who may read every redaction, including full (level-less) ones:
// L-OMNI clearance, staff, admins, the owner and the co-owner.
export function canBypassRedaction(user: {
  clearance: number;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
}): boolean {
  return (
    user.clearance >= OWNER_CLEARANCE ||
    user.isOwner ||
    user.isCoOwner ||
    user.isAdmin ||
    user.isStaff
  );
}

// Redaction markup:
//   [*SECRET*]         -> always redacted (white box), nobody can read it
//   [*SECRET*][3]      -> only viewers with clearance >= L-3 see "SECRET"
//   [*SECRET*][L-O5]   -> only L-O5 (rank 6) and above; others see a box
//   [*SECRET*][OMNI]   -> only L-OMNI (rank 7); others see a box
//
// The level tag accepts a rank number or a clearance label (L-O5, O5, OMNI…).
// Redaction is resolved on the server so hidden text is never sent to a
// browser that isn't cleared to read it.
const REDACT_RE = /\[\*([\s\S]+?)\*\](?:\[([^\]]+)\])?/g;

export function renderRedacted(
  text: string,
  viewerClearance: number,
  canSeeAll = false
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
    const level = match[2] ? parseClearanceToken(match[2]) : null;
    // Cleared viewers (L-OMNI / staff / admin / owner) see everything, including
    // full redactions with no level tag.
    const canSee = canSeeAll || (level !== null && viewerClearance >= level);

    if (canSee) {
      nodes.push(<Fragment key={key++}>{content}</Fragment>);
    } else {
      // Never emit the hidden content — only a same-width block of characters.
      const width = Math.min(Math.max(content.length, 3), 60);
      nodes.push(
        <span
          key={key++}
          className="redacted"
          title={level !== null ? `[REDACTED — REQUIRES ${clearanceLabel(level)}]` : "[REDACTED]"}
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
