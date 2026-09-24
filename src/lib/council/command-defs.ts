import { OptionType } from "../discord/types";
import { BANDS, DIVISION_CHOICES } from "./divisions";

// The Council's command set. Uploaded by
// `npm run council:register` (scripts/register-discord-commands.ts council) and
// answered by lib/council/handlers.ts, which matches on the same names.
//
// Imports are relative, not "@/...": the register script loads this file under
// tsx, outside Next's module resolution. divisions.ts must stay import-free
// for the same reason.

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

const divisionOption = (required: boolean, description: string) => ({
  name: "division",
  description,
  type: OptionType.String,
  required,
  choices: DIVISION_CHOICES,
});

export const COUNCIL_COMMANDS = [
  {
    name: "points",
    description: "Award, remove, or inspect division points",
    options: [
      {
        name: "add",
        description: "Award points in the member's current division",
        type: OptionType.SubCommand,
        options: [userOption, amountOption, reasonOption],
      },
      {
        name: "remove",
        description: "Take points away in the member's current division",
        type: OptionType.SubCommand,
        options: [userOption, amountOption, reasonOption],
      },
      {
        name: "set",
        description: "Set a member's points in their current division",
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
        options: [
          { ...userOption, required: false },
          divisionOption(false, "Which division (defaults to their current one)"),
        ],
      },
      {
        name: "history",
        description: "Recent point changes for a member",
        type: OptionType.SubCommand,
        options: [
          userOption,
          divisionOption(false, "Which division (defaults to their current one)"),
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
    description: "The fifteen highest point totals in a division",
    options: [divisionOption(false, "Which division (defaults to your own)")],
  },
  {
    name: "promote",
    description: "Promotion requests",
    options: [
      {
        name: "request",
        description: "Ask your division's HR to advance you to the next rank",
        type: OptionType.SubCommand,
      },
      {
        name: "list",
        description: "Requests awaiting your review",
        type: OptionType.SubCommand,
        options: [divisionOption(false, "Only this division")],
      },
    ],
  },
  {
    name: "division",
    description: "Division membership",
    options: [
      {
        name: "assign",
        description: "Place a member in a division (or transfer them)",
        type: OptionType.SubCommand,
        options: [userOption, divisionOption(true, "The division to join")],
      },
      {
        name: "remove",
        description: "Take a member out of their division",
        type: OptionType.SubCommand,
        options: [userOption],
      },
      {
        name: "info",
        description: "A member's division and their standing in each division",
        type: OptionType.SubCommand,
        options: [{ ...userOption, required: false }],
      },
    ],
  },
  {
    name: "announce",
    description: "Post an embed to a channel as The Council",
    options: [
      {
        name: "channel",
        description: "Where to post it",
        type: OptionType.Channel,
        channel_types: [0, 5],
        required: true,
      },
      {
        name: "colour",
        description: "The stripe down the side of the embed",
        type: OptionType.String,
        required: false,
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
    name: "council",
    description: "Configure The Council",
    options: [
      {
        name: "setup",
        description: "Set the server-wide roles and channels",
        type: OptionType.SubCommand,
        options: [
          {
            name: "hands_role",
            description: "Hands of the O5 — full control of the bot",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "scarlet_role",
            description: "Scarlet Representative — reviews every division",
            type: OptionType.Role,
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
            description: "Restrict the everyday commands to this role (optional)",
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
        name: "division",
        description: "Set one division's roles and review channel",
        type: OptionType.SubCommand,
        options: [
          divisionOption(true, "The division to configure"),
          {
            name: "hr_role",
            description: "The division's HR — approves promotions, assigns members",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "staff_role",
            description: "May award and remove points in this division",
            type: OptionType.Role,
            required: false,
          },
          {
            name: "review_channel",
            description: "Where this division's promotion requests are posted",
            type: OptionType.Channel,
            required: false,
          },
          {
            name: "division_role",
            description: "Role everyone in the division wears (optional)",
            type: OptionType.Role,
            required: false,
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
        description: "The division ladders",
        type: OptionType.SubCommandGroup,
        options: [
          {
            name: "add",
            description: "Add a rank to a division, or reprice one",
            type: OptionType.SubCommand,
            options: [
              divisionOption(true, "The division whose ladder it belongs to"),
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
                name: "band",
                description: "LR, MR or HR (for display)",
                type: OptionType.String,
                required: false,
                choices: BANDS.map((b) => ({ name: b, value: b })),
              },
              {
                name: "label",
                description: "Name shown in embeds (defaults to the role name)",
                type: OptionType.String,
                required: false,
                max_length: 60,
              },
              {
                name: "form",
                description:
                  "Application form link to also require one; \"off\" to stop",
                type: OptionType.String,
                required: false,
                max_length: 300,
              },
            ],
          },
          {
            name: "remove",
            description: "Remove a rank from its ladder",
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
            description: "Show the ladders from lowest to highest",
            type: OptionType.SubCommand,
            options: [divisionOption(false, "Only this division")],
          },
        ],
      },
    ],
  },
];
