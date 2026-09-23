import {
  ComponentType,
  InteractionResponseType,
  type MessageComponent,
} from "@/lib/discord/types";
import type { Rung } from "./ranks";

// RANK APPLICATIONS.
//
// Some ranks are not earned on points alone. A rank flagged
// `requiresApplication` still needs its points, but `/promote request` answers
// with a form instead of filing straight away; the answers ride along on the
// request and are shown to High Rank on the review panel.
//
// The form is a Discord modal, which fixes the limits below: at most five
// inputs, each labelled in 45 characters or fewer.

export const MAX_QUESTIONS = 5;
export const MAX_LABEL = 45;
/** Per answer. Five of these plus the rest of the review panel must stay
 *  under Discord's 6000-character embed limit. */
export const MAX_ANSWER = 900;

export const DEFAULT_QUESTIONS = [
  "Why do you want this rank?",
  "What have you done to earn it?",
  "Anything else High Rank should know?",
];

export type Answer = { q: string; a: string };

/**
 * Turn what an owner typed into a question list.
 *
 * Questions are separated with `|` in the slash command (a command option is a
 * single line) and stored one per line. Blank entries are dropped, the list is
 * capped at five, and each question is clipped to fit a modal label.
 */
export function parseQuestions(raw: string): string[] {
  return raw
    .split(/[|\n]/)
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS)
    .map((q) => (q.length > MAX_LABEL ? `${q.slice(0, MAX_LABEL - 1)}…` : q));
}

export function questionsFor(rung: Pick<Rung, "applicationQuestions">): string[] {
  const custom = parseQuestions(rung.applicationQuestions);
  return custom.length ? custom : DEFAULT_QUESTIONS;
}

export const applyModalId = (roleId: string) => `engine:apply:submit:${roleId}`;

/** The application form for `rung`. Inputs are keyed q0…q4 by position. */
export function applicationModal(rung: Rung) {
  const title = `Application: ${rung.label}`;
  return {
    type: InteractionResponseType.Modal,
    data: {
      custom_id: applyModalId(rung.roleId),
      title: title.length > MAX_LABEL ? `${title.slice(0, MAX_LABEL - 1)}…` : title,
      components: questionsFor(rung).map(
        (question, i): MessageComponent => ({
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.TextInput,
              custom_id: `q${i}`,
              label: question,
              style: 2,
              required: true,
              max_length: MAX_ANSWER,
            },
          ],
        })
      ),
    },
  };
}

/** Pair each question with the answer submitted for it. */
export function collectAnswers(
  rung: Rung,
  field: (name: string) => string
): Answer[] {
  return questionsFor(rung).map((q, i) => ({
    q,
    a: field(`q${i}`).trim().slice(0, MAX_ANSWER),
  }));
}

export function encodeAnswers(answers: Answer[]): string {
  return answers.length ? JSON.stringify(answers) : "";
}

/** Tolerant of an empty or malformed column: a request whose application
 *  cannot be read still renders, just without the answers. */
export function decodeAnswers(stored: string): Answer[] {
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed)
      ? parsed.filter(
          (x): x is Answer =>
            typeof x?.q === "string" && typeof x?.a === "string"
        )
      : [];
  } catch {
    return [];
  }
}
