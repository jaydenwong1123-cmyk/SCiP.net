import { Fragment, isValidElement, type ReactNode } from "react";

// Author-facing text formatting for document bodies:
//
//   **text**              -> bold
//   ~~text~~              -> strikethrough
//   [center]text[/center] -> centered block
//
// Applied as the *last* pass in the render pipeline (after redaction and SCP
// linking) so it only ever restyles text the viewer is already allowed to see.
// Markers inside a redacted span never reach this code — the hidden text is
// gone by then — and markers around an SCP link are preserved because the pass
// recurses through Fragments while leaving real elements untouched.

const CENTER_RE = /\[center\]([\s\S]*?)\[\/center\]/gi;
// One alternation rather than two passes, so ** and ~~ can't interleave into
// each other's spans (**a~~b** ~~c would otherwise nest wrongly).
const INLINE_RE = /\*\*([\s\S]+?)\*\*|~~([\s\S]+?)~~/g;

function formatInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-t${key++}`}>
          {text.slice(last, match.index)}
        </Fragment>
      );
    }
    if (match[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b${key++}`} className="font-bold">
          {match[1]}
        </strong>
      );
    } else {
      nodes.push(
        <s key={`${keyPrefix}-s${key++}`} className="line-through">
          {match[2]}
        </s>
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-t${key++}`}>{text.slice(last)}</Fragment>
    );
  }

  return nodes;
}

function formatString(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  CENTER_RE.lastIndex = 0;
  while ((match = CENTER_RE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        <Fragment key={`${keyPrefix}-o${key++}`}>
          {formatInline(text.slice(last, match.index), `${keyPrefix}-o${key}`)}
        </Fragment>
      );
    }
    // Centering is a block-level effect, so the span has to break out of the
    // surrounding inline flow to have anywhere to center within.
    nodes.push(
      <span key={`${keyPrefix}-c${key++}`} className="block text-center">
        {formatInline(match[1], `${keyPrefix}-c${key}`)}
      </span>
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(
      <Fragment key={`${keyPrefix}-o${key++}`}>
        {formatInline(text.slice(last), `${keyPrefix}-o${key}`)}
      </Fragment>
    );
  }

  return nodes;
}

export function formatNodes(nodes: ReactNode[]): ReactNode[] {
  return nodes.map((node, i) => formatNode(node, `f${i}`));
}

function formatNode(node: ReactNode, keyPrefix: string): ReactNode {
  if (typeof node === "string") {
    return <Fragment key={keyPrefix}>{formatString(node, keyPrefix)}</Fragment>;
  }

  if (Array.isArray(node)) {
    return (
      <Fragment key={keyPrefix}>
        {node.map((child, i) => formatNode(child, `${keyPrefix}-${i}`))}
      </Fragment>
    );
  }

  // Reach through Fragments only. Matching any element with string children
  // would also rewrite redaction spans and SCP links, dropping their styling.
  if (isValidElement(node) && node.type === Fragment) {
    const child = (node.props as { children?: ReactNode }).children;
    return <Fragment key={keyPrefix}>{formatNode(child, `${keyPrefix}-i`)}</Fragment>;
  }

  return <Fragment key={keyPrefix}>{node}</Fragment>;
}
