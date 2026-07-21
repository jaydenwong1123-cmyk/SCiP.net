import type { ReactNode } from "react";
import { renderRedacted, canBypassRedaction } from "@/lib/redact";
import { formatNodes } from "@/lib/format";
import {
  collectMentions,
  resolveScpLinks,
  linkifyNodes,
} from "@/lib/scp-links";

type Viewer = {
  clearance: number;
  isOwner: boolean;
  isCoOwner: boolean;
  isAdmin: boolean;
  isStaff: boolean;
};

// Render a document body: redaction first, then text formatting, then SCP
// cross-linking over what remains visible.
//
// Order matters. Redaction resolves on the server and drops hidden text
// entirely, so every later pass only ever sees text the viewer is allowed to
// read — a mention inside a redacted block can't be surfaced as a link.
//
// Formatting runs *before* linking so that markers wrapping a mention
// (**SCP-173**, [center]SCP-173[/center]) become the enclosing element, and
// linking then recurses inside it to turn the mention into a link. Running the
// other way round would strand the ** markers on either side of the link
// element, where the formatter cannot pair them.
export async function renderBody(
  text: string,
  viewer: Viewer
): Promise<ReactNode[]> {
  const redacted = renderRedacted(
    text,
    viewer.clearance,
    canBypassRedaction(viewer)
  );
  const formatted = formatNodes(redacted);
  const links = await resolveScpLinks(collectMentions(text));
  return links.size === 0
    ? formatted
    : linkifyNodes(formatted, links, viewer.clearance);
}
