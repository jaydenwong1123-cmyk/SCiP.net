import { roleGrantProblem } from "./security";
import type { GuildRole, MessagePayload } from "./types";

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

    // 401 means Discord did not accept the token at all: it was reset in the
    // Developer Portal, or the variable holds something else (the public key,
    // the client secret). Say which variable to fix rather than "Unauthorized".
    if (res.status === 401) {
      return {
        ok: false,
        status: 401,
        data,
        error: `Discord rejected the bot token. Copy a fresh token from the Developer Portal (Bot → Reset Token) into ${tokenVar} and redeploy.`,
      };
    }

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

  /** Every role in the server, with its permissions and position. */
  const getRoles = (guildId: string) =>
    call<GuildRole[]>("GET", `/guilds/${guildId}/roles`);

  return {
    getRoles,

    /**
     * Grant a role.
     *
     * Every role either bot hands out passes through here, so this is where
     * the anti-nuke guard sits (lib/discord/security.ts): the role is read
     * fresh from Discord and refused if it carries a server-control
     * permission. Checking when a rank is configured is not enough on its own,
     * because the role's permissions can be changed afterwards. If the role
     * cannot be read, nothing is granted.
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
      const roles = await getRoles(guildId);
      if (!roles.ok || !roles.data) {
        return {
          ok: false,
          status: roles.status,
          error: `The role could not be checked before granting it (${roles.error ?? "no data"}), so nothing was changed.`,
        };
      }
      const role = roles.data.find((r) => r.id === roleId);
      if (!role) {
        return { ok: false, status: 404, error: "That role no longer exists in the server." };
      }
      const problem = roleGrantProblem(role, guildId);
      if (problem) return { ok: false, status: 403, error: problem };

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

export type DiscordRest = ReturnType<typeof discordRest>;

// The Engine's bindings.
export const engineRest = discordRest("DISCORD_BOT_TOKEN", "The Engine");
export const {
  addRole,
  removeRole,
  createMessage,
  editMessage,
  putGuildCommands,
} = engineRest;

/**
 * Fill in a deferred interaction reply.
 *
 * Needs no bot token: the interaction's own token is the credential, and it
 * stays valid for 15 minutes. `flags` is dropped because ephemerality was
 * fixed when the reply was deferred and Discord rejects it on an edit.
 */
export async function editOriginalResponse(
  applicationId: string,
  interactionToken: string,
  payload: MessagePayload
): Promise<RestResult> {
  const { flags: _flags, ...rest } = payload;
  void _flags;
  try {
    const res = await fetch(
      `${API}/webhooks/${applicationId}/${interactionToken}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_mentions: { parse: [] }, ...rest }),
        cache: "no-store",
      }
    );
    if (res.ok) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `Discord returned ${res.status}.` };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }
}

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
