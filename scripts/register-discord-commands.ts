import dotenv from "dotenv";
import { COMMANDS } from "../src/lib/discord/command-defs";

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

// Upload The Engine's command set to Discord.
//
//   npm run bot:register
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

async function main() {
  const appId = process.env.DISCORD_APP_ID;
  const guildId = process.env.DISCORD_GUILD_ID;
  const token = process.env.DISCORD_BOT_TOKEN;

  const missing = [
    ["DISCORD_APP_ID", appId],
    ["DISCORD_GUILD_ID", guildId],
    ["DISCORD_BOT_TOKEN", token],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error(
      `[engine] missing environment variable(s): ${missing.join(", ")}\n` +
        "[engine] set them in .env.local — see .env.example for where each one comes from."
    );
    process.exit(1);
  }

  console.log(
    `[engine] registering ${COMMANDS.length} top-level commands for guild ${guildId}`
  );

  const res = await fetch(
    `${API}/applications/${appId}/guilds/${guildId}/commands`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(COMMANDS),
    }
  );

  const body = await res.text();

  if (!res.ok) {
    // Discord's validation errors are deeply nested and genuinely useful — the
    // path in them names the exact option that was rejected — so print the
    // whole thing rather than a summary.
    console.error(`[engine] Discord rejected the command set (${res.status}):`);
    try {
      console.error(JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.error(body);
    }
    process.exit(1);
  }

  const registered = JSON.parse(body) as { name: string }[];
  for (const command of registered) console.log(`[engine]   /${command.name}`);
  console.log(
    `[engine] done. ${registered.length} commands are live in that server now.`
  );
}

main().catch((err) => {
  console.error("[engine] registration failed:", err);
  process.exit(1);
});
