import Link from "next/link";
import { Fragment, isValidElement, type ReactNode } from "react";
import { db } from "@/lib/db";

// Auto-linking and notification support for "@Display Name" mentions in
// message bodies.
//
// Display names are free text and may contain spaces ("L. Cheung"), so this
// can't be a simple word-boundary regex the way SCP-XXXX mentions are (see
// lib/scp-links.tsx). Instead, every "@" is a candidate mention start, and
// the longest known display name that starts there (case-insensitive, and
// not immediately followed by another word character) wins — so "@Alex" next
// to a roster containing both "Alex" and "Alex Kim" resolves to whichever one
// actually appears.

export type MentionCandidate = { id: string; displayName: string };

type Match = { index: number; length: number; user: MentionCandidate };

function findMentions(
  text: string,
  candidates: MentionCandidate[]
): Match[] {
  const sorted = [...candidates].sort(
    (a, b) => b.displayName.length - a.displayName.length
  );
  const results: Match[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "@") {
      const rest = text.slice(i + 1);
      const restLower = rest.toLowerCase();
      const match = sorted.find((c) => {
        const name = c.displayName.toLowerCase();
        if (!restLower.startsWith(name)) return false;
        const next = rest.charAt(c.displayName.length);
        return next === "" || !/\w/.test(next);
      });
      if (match) {
        results.push({ index: i, length: match.displayName.length + 1, user: match });
        i += match.displayName.length + 1;
        continue;
      }
    }
    i++;
  }
  return results;
}

export async function getMentionCandidates(): Promise<MentionCandidate[]> {
  const users = await db.user.findMany({
    where: { displayName: { not: null } },
    select: { id: true, displayName: true },
  });
  return users
    .filter((u): u is { id: string; displayName: string } => !!u.displayName)
    .filter((u) => u.displayName.trim().length > 0);
}

// Users mentioned in a piece of text, deduplicated. Used at send-time to
// decide who to notify.
export function resolveMentionedUsers(
  text: string,
  candidates: MentionCandidate[]
): MentionCandidate[] {
  const found = findMentions(text, candidates);
  const uniq = new Map<string, MentionCandidate>();
  for (const f of found) uniq.set(f.user.id, f.user);
  return [...uniq.values()];
}

// Render text with @mentions turned into links to the mentioned member's
// personnel file.
export function linkifyMentions(
  text: string,
  candidates: MentionCandidate[]
): ReactNode[] {
  const matches = findMentions(text, candidates);
  if (matches.length === 0) return [text];

  const nodes: ReactNode[] = [];
  let last = 0;
  matches.forEach((m, k) => {
    if (m.index > last) {
      nodes.push(<Fragment key={`t${k}`}>{text.slice(last, m.index)}</Fragment>);
    }
    nodes.push(
      <Link
        key={`m${k}`}
        href={`/personnel/${m.user.id}`}
        className="scp-ref scp-ref--live"
      >
        @{m.user.displayName}
      </Link>
    );
    last = m.index + m.length;
  });
  if (last < text.length) {
    nodes.push(<Fragment key="tail">{text.slice(last)}</Fragment>);
  }
  return nodes;
}

// Walk the output of renderRedacted and linkify only the plain-text parts, the
// same way lib/scp-links.tsx does for SCP references: a mention sitting inside
// a redacted span must stay hidden rather than becoming a link that names the
// person the block was hiding.
export function linkifyMentionNodes(
  nodes: ReactNode[],
  candidates: MentionCandidate[]
): ReactNode[] {
  return nodes.map((node, i) => {
    const text =
      typeof node === "string"
        ? node
        : isValidElement(node) && node.type === Fragment
          ? (node.props as { children?: unknown }).children
          : undefined;

    if (typeof text === "string") {
      return (
        <Fragment key={`t${i}`}>{linkifyMentions(text, candidates)}</Fragment>
      );
    }
    // Redaction spans and anything else pass through untouched.
    return <Fragment key={`o${i}`}>{node}</Fragment>;
  });
}
