import type { ReactNode } from "react";
import { renderRedacted, canBypassRedaction } from "@/lib/redact";
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

// Render a document body: redaction first, then SCP cross-linking over what
// remains visible.
//
// Order matters. Redaction resolves on the server and drops hidden text
// entirely; linking then only ever sees text the viewer is allowed to read, so
// a mention inside a redacted block can't be surfaced as a link.
export async function renderBody(
  text: string,
  viewer: Viewer
): Promise<ReactNode[]> {
  const redacted = renderRedacted(
    text,
    viewer.clearance,
    canBypassRedaction(viewer)
  );
  const links = await resolveScpLinks(collectMentions(text));
  if (links.size === 0) return redacted;
  return linkifyNodes(redacted, links, viewer.clearance);
}
