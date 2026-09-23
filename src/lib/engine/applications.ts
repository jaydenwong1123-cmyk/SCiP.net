import {
  ButtonStyle,
  COLOR,
  ComponentType,
  type MessageComponent,
  type MessagePayload,
} from "@/lib/discord/types";
import { panel } from "./embeds";
import type { Rung } from "./ranks";

// RANK APPLICATIONS.
//
// Some ranks are not earned on points alone. A rank with an application form
// (a Google Form, set with /engine rank add ... form:<link>) still needs its
// points, but `/promote request` answers with the form's link instead of filing
// straight away. The member fills the form in, comes back and presses
// "I've submitted it", and only then does the request reach High Rank — with
// the form's link on the review panel so reviewers know where the answers are.
//
// The bot cannot see Google Form responses, so the button is the member's word
// that they applied. That is enough: High Rank reads the responses before
// approving, and a request with no matching response is simply denied.

export const applyDoneId = (roleId: string) => `engine:apply:done:${roleId}`;

/** An https link — the only check made, so any form host works. */
export function isFormUrl(value: string): boolean {
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

/** The reply to /promote request for a rank that needs an application. */
export function applicationPrompt(rung: Rung): MessagePayload {
  return {
    embeds: [
      panel(
        "Application Required",
        `**${rung.label}** needs an application as well as points. You have the points.\n\n` +
          "1. Open the form below and fill it in.\n" +
          "2. Come back here and press **I've submitted it**.\n\n" +
          "-# Your request only reaches High Rank after step 2.",
        { color: COLOR.pending }
      ),
    ],
    components: applicationButtons(rung),
  };
}

function applicationButtons(rung: Rung): MessageComponent[] {
  return [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.Button,
          style: ButtonStyle.Link,
          label: "Open application form",
          url: rung.applicationUrl,
        },
        {
          type: ComponentType.Button,
          style: ButtonStyle.Success,
          label: "I've submitted it",
          custom_id: applyDoneId(rung.roleId),
        },
      ],
    },
  ];
}
