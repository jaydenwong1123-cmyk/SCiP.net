// The slice of Discord's interaction protocol The Engine actually speaks.
//
// Hand-written rather than pulled from discord-api-types: the bot answers four
// interaction types and sends three, and a dependency that models the entire
// gateway would be a large amount of surface area for a handful of fields.
// Anything Discord sends that is not described here is simply ignored.

/** Incoming interaction kinds. */
export const InteractionType = {
  Ping: 1,
  ApplicationCommand: 2,
  MessageComponent: 3,
  ModalSubmit: 5,
} as const;

/** Outgoing response kinds. */
export const InteractionResponseType = {
  Pong: 1,
  ChannelMessageWithSource: 4,
  /** Edits the message the pressed component lives on. */
  UpdateMessage: 7,
  Modal: 9,
} as const;

export const MessageFlags = {
  /** Visible only to the member who ran the command. */
  Ephemeral: 1 << 6,
} as const;

/** Slash-command option types, only the ones the command set declares. */
export const OptionType = {
  SubCommand: 1,
  SubCommandGroup: 2,
  String: 3,
  Integer: 4,
  Boolean: 5,
  User: 6,
  Channel: 7,
  Role: 8,
} as const;

export const ComponentType = {
  ActionRow: 1,
  Button: 2,
  TextInput: 4,
} as const;

export const ButtonStyle = {
  Primary: 1,
  Secondary: 2,
  Success: 3,
  Danger: 4,
} as const;

/** Discord's `ADMINISTRATOR` permission bit (1 << 3), as a BigInt.
 *  Written with the constructor rather than a `8n` literal: this project's
 *  tsconfig targets below ES2020, where BigInt literals are a syntax error. */
export const ADMINISTRATOR = BigInt(8);

export type InteractionOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: InteractionOption[];
};

export type InteractionUser = {
  id: string;
  username: string;
  global_name?: string | null;
  discriminator?: string;
  avatar?: string | null;
};

export type InteractionMember = {
  user?: InteractionUser;
  nick?: string | null;
  roles: string[];
  /** Bitfield as a decimal string — computed for the invoking member. */
  permissions?: string;
};

export type ResolvedData = {
  users?: Record<string, InteractionUser>;
  members?: Record<string, Omit<InteractionMember, "user">>;
  roles?: Record<string, { id: string; name: string }>;
  channels?: Record<string, { id: string; name: string; type: number }>;
};

export type Interaction = {
  id: string;
  application_id: string;
  type: number;
  token: string;
  guild_id?: string;
  channel_id?: string;
  member?: InteractionMember;
  user?: InteractionUser;
  data?: {
    id?: string;
    name?: string;
    options?: InteractionOption[];
    resolved?: ResolvedData;
    /** Components/modals only. */
    custom_id?: string;
    components?: {
      type: number;
      components: { type: number; custom_id: string; value?: string }[];
    }[];
  };
  message?: { id: string };
};

export type Embed = {
  /** Small bold line above everything else; used as an eyebrow label. */
  author?: { name: string; icon_url?: string };
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  thumbnail?: { url: string };
  timestamp?: string;
};

export type MessageComponent = {
  type: number;
  components?: MessageComponent[];
  style?: number;
  label?: string;
  custom_id?: string;
  emoji?: { name: string };
  disabled?: boolean;
  placeholder?: string;
  min_length?: number;
  max_length?: number;
  required?: boolean;
};

export type MessagePayload = {
  content?: string;
  embeds?: Embed[];
  components?: MessageComponent[];
  flags?: number;
  allowed_mentions?: { parse: string[]; users?: string[] };
};

/** Foundation-ish palette for embed sidebars. */
export const COLOR = {
  neutral: 0x2b2d31,
  pending: 0xd4a017,
  approved: 0x3ba55d,
  denied: 0xed4245,
  info: 0x5865f2,
} as const;

/**
 * The display name to show for a member: server nickname first, then the
 * account's global display name, then the raw username. Never the legacy
 * discriminator form — Discord has retired it for most accounts.
 */
export function displayNameOf(
  member?: InteractionMember,
  user?: InteractionUser
): string {
  const u = user ?? member?.user;
  return member?.nick || u?.global_name || u?.username || "Unknown";
}

/** The member who triggered an interaction (guild) or the DM user (fallback). */
export function actorOf(interaction: Interaction): {
  id: string;
  name: string;
} {
  const user = interaction.member?.user ?? interaction.user;
  return {
    id: user?.id ?? "",
    name: displayNameOf(interaction.member, user),
  };
}
