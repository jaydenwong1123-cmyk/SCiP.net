import { OptionType } from "./types";

// The command set, declared once.
//
// scripts/register-discord-commands.ts uploads exactly this array, and the
// dispatcher in lib/engine/handlers.ts reads the same names back. One source
// means a renamed subcommand cannot drift into a command Discord offers but
// the bot does not answer.
//
// Descriptions are what members see in the picker, so they say what the command
// does rather than who may run it — the permission tiers are enforced at
// runtime (lib/engine/permissions.ts) and explained by /engine settings.

const userOption = {
  name: "user",
  description: "The member",
  type: OptionType.User,
  required: true,
};

const amountOption = {
  name: "amount",
  description: "How many points",
  type: OptionType.Integer,
  required: true,
  min_value: 0,
};

const reasonOption = {
  name: "reason",
  description: "Why (shown in the points history)",
  type: OptionType.String,
  required: false,
  max_length: 200,
};

export const COMMANDS = [
  {
    name: "points",
    description: "Award, remove, or inspect service points",
    options: [
      {
        name: "add",
        description: "Award points to a member",
        type: OptionType.SubCommand,
        options: [userOption, amountOption, reasonOption],
      },
      {
        name: "remove",
        description: "Take points away from a member",
        type: OptionType.SubCommand,
        options: [userOption, amountOption, reasonOption],
      },
      {
        name: "set",
        description: "Set a member's points to an exact total",
        type: OptionType.SubCommand,
        options: [
          userOption,
          { ...amountOption, description: "The new total" },
          reasonOption,
        ],
      },
      {
        name: "check",
        description: "Show points, rank, and progress to the next rank",
        type: OptionType.SubCommand,
        options: [{ ...userOption, required: false }],
      },
      {
        name: "history",
        description: "Recent point changes for a member",
        type: OptionType.SubCommand,
        options: [
          userOption,
          {
            name: "limit",
            description: "How many entries (default 10, max 25)",
            type: OptionType.Integer,
            required: false,
            min_value: 1,
            max_value: 25,
          },
        ],
      },
    ],
  },
  {
    name: "leaderboard",
    description: "The fifteen highest point totals in the server",
  },
  {
    name: "announce",
    description: "Post an embed to a channel as The Engine",
    options: [
      {
        name: "channel",
        description: "Where to post it",
        type: OptionType.Channel,
        // Text and announcement channels only. Offering a voice channel or a
        // category in the picker would only produce a failure after the fact.
        channel_types: [0, 5],
        required: true,
      },
      {
        name: "colour",
        description: "The stripe down the side of the embed",
        type: OptionType.String,
        required: false,
        // Values are keys of COLOR in lib/discord/types.ts.
        choices: [
          { name: "Blue (default)", value: "info" },
          { name: "Foundation grey", value: "neutral" },
          { name: "Amber — caution", value: "pending" },
          { name: "Green — good news", value: "approved" },
          { name: "Red — alert", value: "denied" },
        ],
      },
    ],
  },
  {
    name: "promote",
    description: "Promotion requests",
    options: [
      {
        name: "request",
        description: "Ask High Rank to advance you to the next rank",
        type: OptionType.SubCommand,
      },
      {
        name: "list",
        description: "Promotion requests still awaiting review",
        type: OptionType.SubCommand,
      },
    ],
  },
  {
    name: "engine",
    description: "Configure The Engine",
    options: [
      {
        name: "setup",
        description: "Set the roles and channels the bot uses",
        type: OptionType.SubCommand,
        options: [
          {
            name: "staff_role",
            description: "May award and remove points",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "high_rank_role",
            description: "May approve or deny promotions",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "high_command_role",
            description: "May post announcements",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "owner_role",
            description: "May edit the rank ladder and these settings",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "review_channel",
            description: "Where promotion requests are posted for review",
            type: OptionType.Channel,
            required: false,
          },
          {
            name: "announce_channel",
            description: "Where approved promotions are announced (optional)",
            type: OptionType.Channel,
            required: false,
          },
          {
            name: "member_role",
            description:
              "Restrict the everyday commands to this role (optional)",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "points_webhook",
            description:
              "Webhook URL that point changes are posted to publicly (\"off\" to stop)",
            type: OptionType.String,
            required: false,
            max_length: 200,
          },
        ],
      },
      {
        name: "settings",
        description: "Show the current configuration",
        type: OptionType.SubCommand,
      },
      {
        name: "rank",
        description: "The promotion ladder",
        type: OptionType.SubCommandGroup,
        options: [
          {
            name: "add",
            description: "Add a rank, or reprice one that already exists",
            type: OptionType.SubCommand,
            options: [
              {
                name: "role",
                description: "The Discord role for this rank",
                type: OptionType.Role,
                required: true,
              },
              {
                name: "points",
                description: "Points required to reach it",
                type: OptionType.Integer,
                required: true,
                min_value: 0,
              },
              {
                name: "label",
                description: "Name shown in embeds (defaults to the role name)",
                type: OptionType.String,
                required: false,
                max_length: 60,
              },
              {
                name: "application",
                description:
                  "Also require a written application (default: unchanged)",
                type: OptionType.Boolean,
                required: false,
              },
              {
                name: "questions",
                description:
                  "Application questions, separated by | (max 5, 45 chars each)",
                type: OptionType.String,
                required: false,
                max_length: 300,
              },
            ],
          },
          {
            name: "remove",
            description: "Remove a rank from the ladder",
            type: OptionType.SubCommand,
            options: [
              {
                name: "role",
                description: "The rank to remove",
                type: OptionType.Role,
                required: true,
              },
            ],
          },
          {
            name: "list",
            description: "Show the ladder from lowest to highest",
            type: OptionType.SubCommand,
          },
        ],
      },
    ],
  },
] as const;
