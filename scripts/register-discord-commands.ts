import dotenv from "dotenv";
import { COMMANDS } from "../src/lib/discord/command-defs";
import { COUNCIL_COMMANDS } from "../src/lib/council/command-defs";

// Load .env.local FIRST, then .env.
//
// Next.js reads .env.local automatically and gives it precedence, but plain
// dotenv only reads .env — so a script that used `dotenv/config` alone would
// report the Discord secrets as missing even though they were sitting in the
// file the setup guide tells you to put them in. dotenv never overwrites a
// variable that is already set, so loading in this order reproduces Next's
// precedence exactly.
dotenv.config({ path: ".env.local" });
dotenv.config();

// Upload a bot's command set to Discord.
//
//   npm run bot:register       The Engine   (DISCORD_* variables)
//   npm run council:register   The Council  (COUNCIL_* variables)
//
// WHY THIS IS A SCRIPT AND NOT PART OF THE APP. Discord stores the command list
// itself — the names, the options, the pickers members see — separately from
// the endpoint that answers them. Deploying the site does not change that list;
// only a call like this one does. So the two move independently, and this is
// run whenever lib/discord/command-defs.ts changes.
//
// GUILD-SCOPED, not global. Guild commands appear the instant this returns,
// while global ones are cached by Discord for up to an hour — which makes
// iterating on a command set unbearable. Registering for one server is also the
// right scope for a bot that serves one server.
//
// Imports are relative rather than "@/..." on purpose: this runs under tsx
// outside Next's module resolution, which is where the path alias comes from.

const API = "https://discord.com/api/v10";

// Each bot is its own Discord application with its own set of variables.
const BOTS = {
  engine: { tag: "engine", prefix: "DISCORD", commands: COMMANDS },
  council: { tag: "council", prefix: "COUNCIL", commands: COUNCIL_COMMANDS },
} as const;

const choice = (process.argv[2] ?? "engine") as keyof typeof BOTS;
if (!(choice in BOTS)) {
  console.error(`unknown bot "${choice}" — expected one of: ${Object.keys(BOTS).join(", ")}`);
  process.exit(1);
}
const bot = BOTS[choice];
const tag = `[${bot.tag}]`;

async function main() {
  const appId = process.env[`${bot.prefix}_APP_ID`];
  const guildId = process.env[`${bot.prefix}_GUILD_ID`];
  const token = process.env[`${bot.prefix}_BOT_TOKEN`];

  const missing = [
    [`${bot.prefix}_APP_ID`, appId],
    [`${bot.prefix}_GUILD_ID`, guildId],
    [`${bot.prefix}_BOT_TOKEN`, token],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error(
      `${tag} missing environment variable(s): ${missing.join(", ")}\n` +
        `${tag} set them in .env.local — see .env.example for where each one comes from.`
    );
    process.exit(1);
  }

  console.log(
    `${tag} registering ${bot.commands.length} top-level commands for guild ${guildId}`
  );

  const res = await fetch(
    `${API}/applications/${appId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bot.commands),
    }
  );

  const body = await res.text();

  if (!res.ok) {
    // Discord's validation errors are deeply nested and genuinely useful — the
    // path in them names the exact option that was rejected — so print the
    // whole thing rather than a summary.
    console.error(`${tag} Discord rejected the command set (${res.status}):`);
    try {
      console.error(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.error(body);
    }
    process.exit(1);
  }

  const registered = JSON.parse(body) as { name: string }[];
  for (const command of registered) console.log(`${tag}   /${command.name}`);
  console.log(
    `${tag} done. ${registered.length} commands are live in that server now.`
  );
}

main().catch((err) => {
  console.error(`${tag} registration failed:`, err);
  process.exit(1);
});
