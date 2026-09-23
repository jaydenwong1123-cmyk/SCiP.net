# The Engine — setup walkthrough

Follow this top to bottom. Do not skip ahead — several steps only work if the one
before them is done. Each step ends with **✅ You should see**, so you can tell
whether it worked before moving on.

Total time: about 20 minutes.

---

## What you are actually building

The Engine has two halves that live in different places:

| Half | Where it lives | What it is |
|---|---|---|
| The bot's **identity** — its name, avatar, and the commands members see | discord.com's developer site | Created by clicking through a website |
| The bot's **brain** — what actually happens when someone runs a command | Your SCiP.net website, already on Vercel | The code that was just added |

They are joined by **one URL**. When someone types `/points add`, Discord sends a
message to your website, your website works out the answer, and Discord shows it.

That is why there is nothing to install and nothing to keep running. Your bot is
online whenever your website is online.

---

## Part 1 — Create the bot's identity

1. Open <https://discord.com/developers/applications> in a browser.
2. Log in with your normal Discord account if asked.
3. Click the **New Application** button (top right, blue).
4. Type the name: `The Engine`
5. Tick the box agreeing to the developer terms.
6. Click **Create**.

✅ **You should see** a page titled **General Information**, with "The Engine" at
the top and a sidebar on the left containing *General Information*, *Bot*,
*OAuth2*, and others.

---

## Part 2 — Collect four values

You need four pieces of text. **Open Notepad and paste each one in as you go** —
one of them is only shown once.

### Value 1 — Application ID

On the **General Information** page, scroll down slightly. Under the heading
**Application ID** there is a long number and a **Copy** button.

→ Paste it into Notepad, labelled `APP ID`.

### Value 2 — Public Key

On the *same page*, just below the Application ID, is **Public Key** — a long
string of letters and numbers. Click its **Copy** button.

→ Paste it into Notepad, labelled `PUBLIC KEY`.

> This is not a password. It is how your website proves a message genuinely came
> from Discord, and not from somebody who guessed your URL.

### Value 3 — Bot Token

1. In the **left sidebar**, click **Bot**.
2. Find the **Token** section, under the bot's username.
3. Click **Reset Token**.
4. Confirm — Discord may ask for your password or a 2FA code.
5. A long string appears with a **Copy** button. Click it.

→ Paste it into Notepad, labelled `BOT TOKEN`.

> ⚠️ **This one is a password.** Anyone holding it controls your bot completely.
> Never put it in a message, a screenshot, or a git commit. Discord shows it
> **once** — if you lose it, come back and hit Reset Token again, which
> invalidates the old one.

### Value 4 — Server ID

This one comes from the normal Discord app, not the developer site.

1. Open Discord (the app you chat in).
2. Click the **gear icon** ⚙️ next to your name, bottom-left → **User Settings**.
3. In the left sidebar scroll down to **Advanced**.
4. Turn **Developer Mode** ON.
5. Close settings (Esc).
6. **Right-click your server's icon** in the far-left server list.
7. Click **Copy Server ID**.

→ Paste it into Notepad, labelled `SERVER ID`.

✅ **You should now have four values in Notepad.** App ID and Server ID are long
runs of digits; Public Key and Bot Token are mixtures of letters and numbers.

---

## Part 3 — Give the values to your project (your computer)

In your project folder, open the file **`.env.local`** in a text editor. It is in
`C:\Users\jayde\OneDrive\Desktop\SCiP.net`. If your editor seems to hide it, that
is because its name starts with a dot — it does exist.

Scroll to the bottom and add these four lines, pasting your own values between
the quote marks:

```
DISCORD_APP_ID="paste APP ID here"
DISCORD_PUBLIC_KEY="paste PUBLIC KEY here"
DISCORD_BOT_TOKEN="paste BOT TOKEN here"
DISCORD_GUILD_ID="paste SERVER ID here"
```

Save the file.

> "Guild" is Discord's internal word for "server". They mean the same thing.

✅ **You should see** four new lines at the bottom of `.env.local`, each with a
long value inside the quotes and no spaces around the `=`.

---

## Part 4 — Give the same values to Vercel

`.env.local` only works on your own computer. The live website needs its own copy.

1. Go to <https://vercel.com/dashboard>.
2. Click your project — it is called **scip-net**.
3. Click the **Settings** tab (along the top).
4. In the left sidebar, click **Environment Variables**.
5. Add each of the four, one at a time:
   - **Key**: `DISCORD_APP_ID` — **Value**: your App ID → make sure
     **Production**, **Preview** and **Development** are all ticked → **Save**.
   - Repeat for `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`.

✅ **You should see** all four listed on that page when you are done.

### ⚠️ Spell the names exactly

The code looks for these four names character for character. A typo means the
value is simply not there, and the bot reports it as unset:

```
DISCORD_APP_ID
DISCORD_PUBLIC_KEY
DISCORD_BOT_TOKEN      <- TOKEN, not TOEKN
DISCORD_GUILD_ID
```

Only two of them matter to the live site: `DISCORD_PUBLIC_KEY` (to verify each
request came from Discord) and `DISCORD_BOT_TOKEN` (to grant roles and post
messages). The other two are used by `npm run bot:register`, which runs on your
own machine.

### ⚠️ Vercel only picks up variables on the NEXT deployment

Adding or fixing a variable does **not** affect the deployment already running.
After changing one, redeploy — from the dashboard (Deployments → ⋯ → Redeploy)
or with `npx vercel redeploy <url> --target production`.

This is the most common reason a fix "doesn't work": the value is right in the
dashboard, but the running code was built before it existed.

> **On `DATABASE_URL` being marked Sensitive:** the project README warns that a
> Sensitive `DATABASE_URL` is hidden from the build, so migrations silently miss
> production. That was *not* the behaviour observed when this bot was deployed —
> the build log showed the migration applying to the real Turso database with
> `DATABASE_URL` marked Sensitive. Worth knowing the failure exists, but check
> the build log before acting on it: if `prisma migrate deploy` reports
> "migration(s) have been applied", production got them.


---

## Part 5 — Put the new code live

In your terminal, in the project folder:

```bash
git add -A
git commit -m "Add The Engine Discord bot"
git push
```

Then wait for Vercel to finish building — watch it on the dashboard, it takes a
minute or two.

**Find your website's address** while you wait: on the Vercel project page, the
**Domains** section lists it. It will be something like `scip-net.vercel.app`, or
your own custom domain if you have one. Write it in Notepad as `DOMAIN`.

✅ **Test that the bot's door exists.** In PowerShell, replacing `YOURDOMAIN`:

```powershell
try { Invoke-WebRequest -Method POST -Uri "https://YOURDOMAIN/api/discord/interactions" -UseBasicParsing } catch { $_.Exception.Response.StatusCode.value__ }
```

**You should see `401`.** That is exactly right — it means the endpoint is alive
and is refusing a request that wasn't signed by Discord. Any other number means
something is wrong; see Troubleshooting.

---

## Part 6 — Invite the bot to your server

1. In the left sidebar, click **OAuth2**.
2. Scroll to **OAuth2 URL Generator**.
3. Under **Scopes**, tick:
   - ☑ `bot`
   - ☑ `applications.commands`
4. A **Bot Permissions** box now appears below. Tick:
   - ☑ **Manage Roles** — so it can give people their rank
   - ☑ **View Channels**
   - ☑ **Send Messages** — so it can post promotion requests
   - ☑ **Embed Links** — so those posts render properly
5. At the very bottom, a **Generated URL** appears. Click **Copy**.
6. Paste it into your browser's address bar and press Enter.
7. Choose your server from the dropdown → **Continue** → **Authorize**.

**Shortcut:** instead of all that, paste this straight into your browser,
replacing `YOUR_APP_ID` with the App ID from Notepad:

```
https://discord.com/oauth2/authorize?client_id=YOUR_APP_ID&permissions=268454912&scope=bot%20applications.commands
```

✅ **You should see** The Engine appear in your server's member list, greyed out
as though offline. **That is normal and correct** — this kind of bot never shows
as "online" because it holds no permanent connection. It still works.

---

## Part 7 — Upload the slash commands

Discord keeps its own list of what commands exist. Deploying your site does not
update that list — this command does.

**This only works once the bot is in your server** (Part 6). The commands are
registered *to that server*, so Discord refuses with "Missing Access" if the bot
has not joined it yet.

In your terminal, in the project folder:

```bash
npm run bot:register
```

✅ **You should see**:

```
[engine] registering 5 top-level commands for guild 123456789...
[engine]   /points
[engine]   /leaderboard
[engine]   /announce
[engine]   /promote
[engine]   /engine
[engine] done. 5 commands are live in that server now.
```

> Run this again any time the command list changes. If it complains about a
> missing environment variable, Part 3 is not finished.

---

## Part 8 — Connect Discord to your website

1. Go back to <https://discord.com/developers/applications> and click **The Engine**.
2. On **General Information**, scroll to **Interactions Endpoint URL**.
3. Paste your address followed by the path — for example:
   ```
   https://scip-net.vercel.app/api/discord/interactions
   ```
4. Click **Save Changes**.

✅ **You should see** a green confirmation. Discord tests the URL before it will
accept it, so **if it saves, Parts 3–5 are definitely correct.** If it refuses,
see Troubleshooting — do not continue until this saves.

---

## Part 9 — Move The Engine's role up ⚠️

**This is the step people miss, and it breaks promotions.**

Discord will not let a bot hand out a role that sits at or above its own position
in the role list. So The Engine's role must be **above every rank role**.

1. In Discord: **Server Settings** → **Roles**.
2. Find **The Engine** in the list.
3. **Drag it upwards** so it sits above all your rank roles.

```
   Owner               ← your staff roles can stay above
   High Command
   High Rank
 ┌──────────────────┐
 │ The Engine       │  ← must be ABOVE every rank it hands out
 └──────────────────┘
   Senior Researcher   ← your ranks
   Researcher
   Junior Researcher
```

✅ **You should see** The Engine sitting above every role you intend to use as a
rank. If you forget, the bot says so in plain language when an approval fails —
it does not fail silently.

---

## Part 10 — Tell the bot your roles and channels

Now you configure it from inside Discord. Type this in any channel:

```
/engine setup
```

**How Discord's command options work:** after typing `/engine setup`, Discord
shows a list of optional settings. Click one (or press Tab), pick the role or
channel from the menu it offers, then move to the next. You do not type role
names by hand.

Set these:

| Option | Pick | What it controls |
|---|---|---|
| `staff_role` | your staff/NCO role | who can award and remove points |
| `high_rank_role` | your high rank role | who can approve promotions |
| `high_command_role` | your high command role | who can post announcements |
| `owner_role` | your owner/admin role | who can edit ranks and settings |
| `review_channel` | e.g. `#promotions` | where requests appear for approval |
| `announce_channel` | e.g. `#announcements` | optional — where approvals are announced |
| `member_role` | leave empty for now | optional — see below |
| `points_webhook` | a webhook URL | optional — posts every point change publicly (see below) |

Press Enter.

✅ **You should see** a configuration panel listing everything you just set, with
anything you skipped shown as *not set*.

> **About `member_role`:** leave it unset and everyone in the server can check
> their points, see the leaderboard, and request a promotion. Set it to a role
> and *only* people with that role can use even those basic commands. That is the
> "only people I choose can use the bot" lock, and it is optional.

> **About `points_webhook` (the public points log):** in Discord, open the
> channel you want the log in → **Edit Channel → Integrations → Webhooks → New
> Webhook**. Name it (e.g. `SSF Points`), give it an avatar, click **Copy Webhook
> URL**, and paste that into `points_webhook`. From then on every
> `/points add`, `/points remove` and `/points set` posts a line there:
>
> **SSF POINTS | POINTS SYSTEM**
> Added `5 points` to @member. They now have `7 points`.
>
> with who made the change and the reason underneath in small text. Nobody gets
> pinged. To stop it, run `/engine setup points_webhook:off`. If the webhook is
> ever deleted, the points still change and the staff member is told the log
> failed.

> **Worried about locking yourself out?** You can't. Anyone with Discord's
> **Administrator** permission always keeps full access to the bot, whatever
> these settings say.

---

## Part 11 — Build your rank ladder

Add your ranks, cheapest first. For each one:

```
/engine rank add role:@Junior Researcher points:0
/engine rank add role:@Researcher points:100
/engine rank add role:@Senior Researcher points:250
```

- `role` — pick the Discord role from the menu.
- `points` — how many points a member needs to reach that rank.
- `label` — optional; defaults to the role's own name.

The order is worked out from the points, so you can add them in any order, and
reprice any rank later by running `rank add` again with the same role.

### Ranks that need an application

Some ranks should need a written application **as well as** the points. Add
`application:True` to the rank:

```
/engine rank add role:@Site Director points:500 application:True
```

To ask your own questions instead of the defaults, add `questions`, separated
with `|` (up to 5, each 45 characters or fewer — Discord's form limits):

```
/engine rank add role:@Site Director points:500 questions:Why do you want this rank?|What have you led?|How active are you?
```

Giving `questions` switches the application on by itself. To switch it off
again: `/engine rank add role:@Site Director points:500 application:False`.
Re-pricing a rank without mentioning `application` leaves it as it was.

The default questions are *Why do you want this rank?*, *What have you done to
earn it?*, and *Anything else High Rank should know?*.

Check it:

```
/engine rank list
```

✅ **You should see** your ranks numbered 1, 2, 3 from cheapest to dearest, with
`+ application` after any rank that needs one.

---

## Part 12 — Test the whole thing

Run these in order:

1. `/points add user:@yourself amount:150 reason:testing`
   → ✅ "Awarded **150** points…"
2. `/leaderboard`
   → ✅ a public panel headed **Service Record** with you at position `01`
3. `/points check`
   → ✅ your points, standing, rank, and what the next rank needs
4. `/promote request`
   → ✅ "Request filed…" **and** an embed appears in your review channel with a
   green **Approve** and a red **Deny** button
5. Click **Approve** (from an account holding the High Rank role)
   → ✅ the rank role appears on the member, and the embed turns green naming who
   approved it

Then tidy up after the test: `/points set user:@yourself amount:0`

---

## Posting announcements

High Command (and Owner) can post a formatted embed through the bot, so official
notices come from The Engine rather than from a person's account.

```
/announce channel:#announcements colour:Red — alert
```

Press Enter and **a compose box opens** with three fields:

| Field | |
|---|---|
| **Title** | The heading, in bold at the top |
| **Message** | The body. **This box accepts line breaks** — press Enter for a new paragraph. Discord markdown works: `**bold**`, `*italics*`, `- lists`, `[links](https://…)` |
| **Footer** | Optional small grey line at the bottom, e.g. `— O5 Council` |

Fill it in, click **Submit**, and the embed appears in the channel you chose. You
get a private confirmation; nobody sees that you were the one who used the
command.

The compose box exists because a slash-command option is a single line with no
way to insert a paragraph break, which is no use for writing an announcement.

**Colours** are optional and default to blue: Foundation grey, blue, amber
(caution), green (good news), red (alert).

Two things worth knowing:

- **It cannot ping anyone.** `@everyone`, `@here` and role mentions render as
  text but will not notify. This is deliberate — a command that can ping the
  whole server is a mistake waiting to happen.
- **The embed does not say who posted it.** If you want it attributed, put it in
  the footer.

If the bot replies that it could not post, it almost always lacks **View
Channel**, **Send Messages** or **Embed Links** in that one channel — check the
channel's own permission overrides, not just the server-wide ones.

## How a promotion works

1. A member runs `/promote request`. The Engine checks the ladder — they must
   have enough points for the **next rank up**, one step at a time. Points alone
   never promote anybody.
2. An embed appears in your review channel with **Approve** / **Deny**. Only High
   Rank (and admins) can press them; anyone else gets a private refusal.
3. **Approve** → the bot adds the new rank role, removes the old one, and turns
   the embed green. The role arriving is how the member finds out.
4. **Deny** → a box opens for a reason, which is recorded on the embed in red.
5. **Ranks that need an application:** in step 1 the member must still have the
   points first. Once they do, `/promote request` opens a form with the rank's
   questions instead of filing straight away. When they submit it, the review
   embed is headed **Rank Application** and shows every answer, and High Rank
   approves or denies it with the same buttons.
6. The buttons vanish once decided, so nobody can approve the same request twice
   by scrolling back to it.

A member's rank is whatever role **the bot** last gave them. A rank you handed
out by hand before installing the bot reads as "unranked" until their first
approved promotion.

---

## Command reference

| Command | Who can use it |
|---|---|
| `/points add user amount [reason]` | Staff |
| `/points remove user amount [reason]` | Staff |
| `/points set user amount [reason]` | Staff |
| `/points history user [limit]` | Staff |
| `/points check [user]` | anyone |
| `/leaderboard` — top 15 | anyone |
| `/promote request` | anyone |
| `/promote list` — what is awaiting review | High Rank |
| `/announce channel [colour]` — post an embed | High Command |
| `/engine rank add role points [label] [application] [questions]` | Owner |
| `/engine rank remove / list` | Owner |
| `/engine setup`, `/engine settings` | Owner |

Higher tiers can do everything the lower ones can — High Rank can award points
without also holding the staff role. Refusals are always private to whoever tried.

---

## Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| **"This interaction failed"** | Your website didn't answer, or answered wrongly | Check the Vercel deployment finished. Check `DISCORD_PUBLIC_KEY` on Vercel exactly matches the developer site. |
| **Discord won't save the Interactions Endpoint URL** | Discord's test request was rejected | The URL must end in `/api/discord/interactions`; the site must have been deployed *after* you added the environment variables; `DISCORD_PUBLIC_KEY` must be correct. |
| **`npm run bot:register` says "Missing Access" (50001)** | The bot has not joined the server | Do Part 6 first — commands register *to a server*, so the bot must already be in it. |
| **Commands don't appear when I type `/`** | The command list was never uploaded | Run `npm run bot:register`, then fully restart Discord (Ctrl+R). |
| **"The application did not respond"** | Your site took more than 3 seconds | Usually a one-off cold start — try again. If it keeps happening, say so and the replies can be switched to the deferred style. |
| **"Discord refused the role change…"** on approval | The bot's role is too low | Part 9 — drag The Engine above the rank roles. |
| **"DISCORD_BOT_TOKEN is not set"** | The variable is missing, misspelled, or the deployment predates it | Check the spelling in Vercel (Part 4), then **redeploy** — env changes need a new deployment. |
| **A database error on every command** | The `Engine*` tables aren't in production | Check the build log for "migration(s) have been applied". If not, run `npm run db:deploy` against the production `DATABASE_URL`. |
| **The bot shows as offline** | Nothing is wrong | This kind of bot is always greyed out. It still works. |
| **"You do not have clearance…"** | Working as designed | Run `/engine settings` — you may not hold the role assigned to that tier. |

---

## For future reference — where the code lives

| Path | What it is |
|---|---|
| [`src/app/api/discord/interactions/route.ts`](../src/app/api/discord/interactions/route.ts) | The endpoint Discord talks to |
| [`src/lib/discord/verify.ts`](../src/lib/discord/verify.ts) | Checks each request really came from Discord |
| [`src/lib/discord/rest.ts`](../src/lib/discord/rest.ts) | Granting roles, posting messages |
| [`src/lib/discord/command-defs.ts`](../src/lib/discord/command-defs.ts) | The command list — edit, then `npm run bot:register` |
| [`src/lib/engine/`](../src/lib/engine/) | Points, ranks, promotions, permissions, embeds |

The bot's tables are all prefixed `Engine` and are entirely separate from SCiP.net
accounts — a Discord member has points and a rank without ever registering on the
website.

`npm test` covers the signature check, the permission tiers, the ladder rules and
the points maths. The endpoint itself can only be exercised by a real signed
request, so test changes on a preview deploy.
