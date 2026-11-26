import { executeWebhook } from "@/lib/discord/rest";
import {
  InteractionResponseType,
  InteractionType,
  actorOf,
  type Embed,
  type Interaction,
  type InteractionOption,
} from "@/lib/discord/types";
import { getEngineConfig } from "./config";

// THE COMMAND LOG.
//
// Most of The Engine's answers are ephemeral: only the person who ran the
// command sees them. When an owner sets `/engine setup command_log`, a copy of
// every command and its reply is posted to that webhook as well, so the whole
// server can follow what the bot is being asked and what it said.
//
// This runs after the reply has gone out (the route schedules it with
// `after()`), so a slow or broken webhook never costs the member their answer.

/** Replies that must stay private, even with the log on. Refusals are the
 *  main case: a public "you are not allowed" is a telling-off in front of the
 *  whole server. Tagged by the handler that builds them. */
const privateReplies = new WeakSet<object>();

export function keepPrivate<T extends object>(response: T): T {
  privateReplies.add(response);
  return response;
}

// Options whose values are secrets. A webhook URL is enough to post as the
// bot's webhook, so it is never repeated in a public channel.
const SECRET_OPTION = /webhook|command_log/i;

const OptionType = { SubCommand: 1, SubCommandGroup: 2, User: 6, Channel: 7, Role: 8, Mentionable: 9 };

/** `/points add user:@x amount:5`, rebuilt from the interaction payload. */
export function commandLine(interaction: Interaction): string {
  const parts = [`/${interaction.data?.name ?? "?"}`];
  let level: InteractionOption[] = interaction.data?.options ?? [];
  for (;;) {
    const node = level.find(
      (o) => o.type === OptionType.SubCommand || o.type === OptionType.SubCommandGroup
    );
    if (!node) break;
    parts.push(node.name);
    level = node.options ?? [];
  }
  for (const opt of level) {
    if (opt.value === undefined) continue;
    const value = String(opt.value);
    let shown: string;
    if (SECRET_OPTION.test(opt.name) && value.toLowerCase() !== "off") shown = "[hidden]";
    else if (opt.type === OptionType.User) shown = `<@${value}>`;
    else if (opt.type === OptionType.Role) shown = `<@&${value}>`;
    else if (opt.type === OptionType.Channel) shown = `<#${value}>`;
    else if (opt.type === OptionType.Mentionable) {
      shown = interaction.data?.resolved?.roles?.[value] ? `<@&${value}>` : `<@${value}>`;
    } else shown = value.length > 100 ? `${value.slice(0, 100)}…` : value;
    parts.push(`${opt.name}:${shown}`);
  }
  return parts.join(" ");
}

/** What the member did, as a short line for the log's header. */
function actionLabel(interaction: Interaction): string | null {
  if (interaction.type === InteractionType.ApplicationCommand) {
    return `\`${commandLine(interaction).replace(/`/g, "'")}\``;
  }
  if (interaction.type === InteractionType.ModalSubmit) {
    const id = interaction.data?.custom_id ?? "";
    if (id.startsWith("engine:say:")) return "`/announce` (posted)";
    if (id.startsWith("engine:promo:denyreason:")) return "a promotion denial";
  }
  return null;
}

type Reply = { type: number; data?: unknown };
type ReplyData = { content?: string; embeds?: Embed[] };

/** The webhook message for one interaction, or null when there is nothing to log. */
export function commandLogMessage(
  interaction: Interaction,
  response: Reply
): { content: string; embeds?: Embed[] } | null {
  if (privateReplies.has(response)) return null;
  // Only real answers: not modals being opened, button edits (already
  // public on the message they edit) or pings.
  if (response.type !== InteractionResponseType.ChannelMessageWithSource) return null;
  const action = actionLabel(interaction);
  if (!action) return null;

  const actor = actorOf(interaction);
  const where = interaction.channel_id ? ` in <#${interaction.channel_id}>` : "";
  const header = `-# <@${actor.id}> ran ${action}${where}`;
  const data = (response.data ?? {}) as ReplyData;
  const body = data.content?.trim() ?? "";
  let content = body ? `${header}\n${body}` : header;
  if (content.length > 2000) content = `${content.slice(0, 1999)}…`;

  const embeds = data.embeds?.slice(0, 10);
  return embeds?.length ? { content, embeds } : { content };
}

/** Post the copy. Failures are logged server-side only: the member already has
 *  their answer, and there is nobody waiting to read an error. */
export async function mirrorToCommandLog(
  interaction: Interaction,
  response: Reply
): Promise<void> {
  const guildId = interaction.guild_id;
  if (!guildId) return;
  const message = commandLogMessage(interaction, response);
  if (!message) return;
  const config = await getEngineConfig(guildId);
  if (!config.commandLogWebhookUrl) return;
  const posted = await executeWebhook(config.commandLogWebhookUrl, message);
  if (!posted.ok) console.error("[engine] command log not posted:", posted.error);
}
