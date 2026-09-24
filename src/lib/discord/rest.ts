import type { MessagePayload } from "./types";

// Thin client for the handful of Discord REST calls the bot makes.
//
// Two rules, both learned from what goes wrong in a bot:
//
//   1. Nothing throws. Every call returns { ok, error? }, because the common
//      failures here are OPERATIONAL, not exceptional — the bot's role sits
//      below the rank role in the hierarchy, someone deleted the review
//      channel, the token was rotated. Each of those should come back to the
//      member as a sentence they can act on, not a 500 and a silent embed.
//   2. The token is read per call, never captured at module load, so a rotated
//      secret takes effect on the next invocation.
//
// More than one bot is served from this app, each with its own Discord
// application and token. discordRest() binds the calls to one bot's token
// variable; the plain named exports below are The Engine's, bound to
// DISCORD_BOT_TOKEN, so its code never has to know the factory exists.

const API = "https://discord.com/api/v10";

export type RestResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

async function request<T>(
  tokenVar: string,
  method: string,
  path: string,
  body?: unknown
): Promise<RestResult<T>> {
  const token = process.env[tokenVar];
  if (!token) {
    return { ok: false, status: 0, error: `${tokenVar} is not set.` };
  }

  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });

    if (res.status === 204) return { ok: true, status: 204 };

    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : undefined;

    if (!res.ok) {
      const message =
        (data as { message?: string } | undefined)?.message ??
        `Discord returned ${res.status}.`;
      return { ok: false, status: res.status, data, error: message };
    }

    return { ok: true, status: res.status, data };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }
}

/**
 * The token-bearing calls, bound to one bot.
 *
 * `tokenVar` names the environment variable holding that bot's token, and
 * `botName` is how refusals refer to it — the fix for a 403 is to move THAT
 * bot's role, and naming the wrong bot sends someone to the wrong role.
 */
export function discordRest(tokenVar: string, botName: string) {
  const call = <T>(method: string, path: string, body?: unknown) =>
    request<T>(tokenVar, method, path, body);

  return {
    /**
     * Grant a role.
     *
     * The failure worth naming is 403: Discord refuses to let a bot hand out a
     * role positioned at or above its own highest role, which is the single
     * most common reason a correctly built promotion command appears to do
     * nothing. The message is rewritten so the reviewer sees the fix rather
     * than "Missing Permissions".
     */
    async addRole(
      guildId: string,
      userId: string,
      roleId: string
    ): Promise<RestResult> {
      const res = await call(
        "PUT",
        `/guilds/${guildId}/members/${userId}/roles/${roleId}`
      );
      if (!res.ok && res.status === 403) {
        return {
          ...res,
          error: `Discord refused the role change. Move ${botName}'s role ABOVE the rank roles in Server Settings → Roles, and make sure it has Manage Roles.`,
        };
      }
      return res;
    },

    async removeRole(
      guildId: string,
      userId: string,
      roleId: string
    ): Promise<RestResult> {
      return call("DELETE", `/guilds/${guildId}/members/${userId}/roles/${roleId}`);
    },

    async createMessage(
      channelId: string,
      payload: MessagePayload
    ): Promise<RestResult<{ id: string }>> {
      return call<{ id: string }>("POST", `/channels/${channelId}/messages`, {
        // Mentions render as mentions but never ping by default; a promotion
        // embed naming three roles should not notify all three.
        allowed_mentions: { parse: [] },
        ...payload,
      });
    },

    async editMessage(
      channelId: string,
      messageId: string,
      payload: MessagePayload
    ): Promise<RestResult> {
      return call("PATCH", `/channels/${channelId}/messages/${messageId}`, {
        allowed_mentions: { parse: [] },
        ...payload,
      });
    },

    /** Overwrite this guild's command set. */
    async putGuildCommands(
      applicationId: string,
      guildId: string,
      commands: unknown[]
    ): Promise<RestResult<unknown[]>> {
      return call<unknown[]>(
        "PUT",
        `/applications/${applicationId}/guilds/${guildId}/commands`,
        commands
      );
    },
  };
}

// The Engine's bindings.
const engine = discordRest("DISCORD_BOT_TOKEN", "The Engine");
export const {
  addRole,
  removeRole,
  createMessage,
  editMessage,
  putGuildCommands,
} = engine;

/**
 * Post through a channel webhook.
 *
 * Needs no bot token — the URL is its own credential — and posts under the
 * webhook's name and avatar as set in Discord, not the bot's. Same no-throw
 * contract as everything else here.
 */
export async function executeWebhook(
  url: string,
  payload: MessagePayload
): Promise<RestResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_mentions: { parse: [] }, ...payload }),
      cache: "no-store",
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text();
    let message = `Discord returned ${res.status}.`;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? message;
    } catch {
      // Non-JSON error body; keep the status line.
    }
    return { ok: false, status: res.status, error: message };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }
}
