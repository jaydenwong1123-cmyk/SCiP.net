# The Council: setup walkthrough

The Council is the second bot. It works like The Engine (points, then a request, then an
approval), with one difference: **each division has its own ladder, its own points
and its own reviewers.**

```
Hands of the O5          ┐ handpicked, never on a ladder
Scarlet Representative   ┘
 ├─ Clerical      LR → MR → HR
 ├─ Operational   LR → MR → HR
 └─ Judicial      HR
      ├─ Judicial Enforcers    ─┐ the top rank of either promotes
      └─ Judicial Legislators  ─┘ into the lowest Judicial HR rank
```

It runs from the same website as The Engine, so there is still nothing to install.
Many steps match [the-engine.md](the-engine.md). Where they do, this guide points
you there and only lists what changes.

---

## Part 1: Create a second Discord application

Follow **Parts 1 and 2 of the-engine.md**, with two changes:

- Name the application `The Council`.
- Use the **Server ID of the new server**.

It must be a new application. Reusing The Engine's would make one bot answer both
servers.

## Part 2: Add the four values

In `.env.local` **and** on Vercel (Settings → Environment Variables):

```
COUNCIL_APP_ID="..."
COUNCIL_PUBLIC_KEY="..."
COUNCIL_BOT_TOKEN="..."
COUNCIL_GUILD_ID="..."
```

These sit alongside The Engine's `DISCORD_*` values. Don't overwrite those.

Then deploy (`git push`) so Vercel picks the values up. Changes to variables only
take effect on the **next** deployment.

✅ **Check:** in PowerShell, `POST https://YOURDOMAIN/api/discord/council/interactions`
returns **401**. See Part 5 of the-engine.md for the exact command.

## Part 3: Invite it, register commands, connect it

1. **Invite** the bot to the new server. Use the invite link from Part 6 of
   the-engine.md, but with the Council's App ID.
2. **Register the commands:**
   ```
   npm run council:register
   ```
   ✅ You should see `/points /leaderboard /promote /division /shift /announce /council` listed.
3. **Connect it:** in the developer portal, open The Council → General Information →
   **Interactions Endpoint URL** →
   `https://YOURDOMAIN/api/discord/council/interactions` → Save.
4. **Move The Council's role above every rank role and division role** in Server
   Settings → Roles. If you skip this, approvals fail, but the bot tells you why.

---

## Part 4: Server-wide roles

```
/council setup hands_role:@Hands of the O5 scarlet_role:@Scarlet Representative announce_channel:#promotions
```

| Option | What it does |
|---|---|
| `hands_role` | Full control of the bot, including all configuration |
| `scarlet_role` | Can review, assign and award points in **every** division, and post announcements |
| `announce_channel` | Optional. Approved promotions are announced here |
| `member_role` | Optional. Once set, only people with this role (or a division role the bot knows) can use the bot |
| `points_webhook` | Optional. A public log of every point change, set up the same way as in The Engine |

Server administrators always keep full access, so you can't lock yourself out.

## Part 5: Set up each division

Run this once per division. Each option is optional, so you can come back and change
one at a time.

```
/council division division:Clerical hr_role:@Clerical HR staff_role:@Clerical MR review_channel:#clerical-promotions division_role:@Clerical
```

| Option | What it does |
|---|---|
| `hr_role` | The division's HR. Approves its promotions, assigns and transfers members into it, awards its points |
| `staff_role` | Can award and remove points in this division only |
| `review_channel` | Where this division's promotion requests are posted |
| `division_role` | Optional. A role everyone in the division wears. It is given on assignment and removed on transfer |

Do this for **Clerical**, **Operational** and **Judicial**, then for **Judicial
Enforcers** and **Judicial Legislators**.

For the two Judicial subdivisions, `hr_role` and `review_channel` can be left empty:

- **Judicial HR automatically reviews both subdivisions.**
- A subdivision without its own review channel uses Judicial's channel.

You will usually only set a `staff_role` and a `division_role` for them.

Check everything with `/council settings`.

## Part 6: Build the ladders

Each rank belongs to exactly one division. Add them cheapest first. `band` is only a
label (LR/MR/HR) for display. The order comes from the points.

```
/council rank add division:Clerical role:@Clerical Cadet points:0 band:LR
/council rank add division:Clerical role:@Clerical Officer points:100 band:MR
/council rank add division:Clerical role:@Clerical Director points:300 band:HR

/council rank add division:Judicial Enforcers role:@Enforcer points:0 band:LR
/council rank add division:Judicial Enforcers role:@Senior Enforcer points:150 band:MR

/council rank add division:Judicial Legislators role:@Clerk of Law points:0 band:LR
/council rank add division:Judicial Legislators role:@Legislator points:200 band:MR

/council rank add division:Judicial role:@Magistrate points:400 band:HR
/council rank add division:Judicial role:@High Justice points:600 band:HR
```

Rank applications work as they do in The Engine: add `form:https://forms.gle/...`
to a rank.

Check the ladders with `/council rank list`. It shows every division, and notes that
the top Enforcer and Legislator ranks lead into Judicial.

> **Do not add Hands of the O5 or Scarlet Representative as ranks.** They are
> handpicked, and the bot refuses them.

---

## How it works day to day

1. **Assign.** A division's HR runs `/division assign user:@someone division:Clerical`.
   The member now climbs the Clerical ladder.
2. **Earn.** `/points add user:@someone amount:25` awards points **in their current
   division**. Only that division's staff or HR (or Scarlet or Hands) can do it.
3. **Request.** The member runs `/promote request`. The panel goes to *their
   division's* review channel.
4. **Decide.** Only that division's HR (or Scarlet or Hands) can press Approve or
   Deny. Anyone else is refused privately.

### From Enforcers or Legislators into Judicial HR

When a member at the **top** Enforcer or Legislator rank has enough points, running
`/promote request` asks for the **lowest Judicial rank**. The panel says
*Judicial Enforcers → Judicial* and goes to Judicial's review channel. Approving it:

- gives them the Judicial rank and removes their old one,
- swaps their division role (Enforcers → Judicial),
- moves them into Judicial, **taking their points with them**.

### Transfers

`/division assign` on someone already in another division transfers them. Only
someone with authority over **both** divisions can do this, which in practice means
Scarlet or Hands. That stops one division's HR taking members from another.

On a transfer, the member loses the old division's rank and division roles, and any
open request is withdrawn. Their points and rank in the old division are **kept**. If
they are ever moved back, the bot restores both.

`/division info user:@someone` shows their current division and their standing in
every division they have served in.

### Shifts

Members earn points for time on duty as well as from awards. Only members in a
division can go on shift, and the points are paid into the division they started
the shift in.

- **`/shift manage`** opens your shift panel, with **Start**, **Pause** (it becomes
  **Resume** while you are on break) and **End**. Time on break does not count.
  The panel also shows your all-time shift count, total and average time, and the
  points your shifts have earned.
- **`/shift active`** lists everyone on shift now and how long they have been on.
- **`/shift admin user:@someone`** opens the same panel for HR, with **Start**,
  **End**, **Add time**, **Set time** and **Delete**. Time can be typed as `90`,
  `1h30m` or `1:30`. Deleting throws the shift away without paying any points, and
  asks you to confirm first.

When a shift ends, its length is turned into points:

| Time on shift | Points |
|---|---|
| Under 10 minutes | 0 |
| 10 – 17 minutes | ½ |
| 18 – 35 minutes | 1 |
| 36 – 54 minutes | 2 |
| 55 – 60 minutes | 4 |
| Past an hour | 4, plus 1 for every 10 more minutes (a block counts from its 8th minute), plus a bonus 2 once a second full hour is served |

So 70 minutes is 5 points and 2 hours is 12. Shift payouts appear in `/points
history` and the public points log like any other award.

Because of the half point, points can be decimals. `/points add`, `remove` and
`set` accept them too (for example `amount:0.5`).

---

## Command reference

| Command | Who |
|---|---|
| `/points add / remove / set user amount [reason]` | That division's staff or HR, Scarlet, Hands |
| `/points history user [division]` | Same |
| `/points check [user] [division]` | Anyone |
| `/leaderboard [division]` | Anyone. Defaults to your own division |
| `/promote request` | Anyone in a division |
| `/promote list [division]` | Reviewers. Shows only the divisions you can review |
| `/division assign user division` | That division's HR (and the old division's HR, for a transfer), Scarlet, Hands |
| `/division remove user` | Their division's HR, Scarlet, Hands |
| `/division info [user]` | Anyone |
| `/shift manage` | Anyone in a division |
| `/shift active` | Anyone |
| `/shift admin user` | Their division's HR, Scarlet, Hands |
| `/announce channel [colour]` | Scarlet, Hands |
| `/council setup`, `/council division`, `/council rank …`, `/council settings` | Hands |

## Troubleshooting

Everything in The Engine's troubleshooting table applies, with `COUNCIL_*` in place
of `DISCORD_*` and `npm run council:register` in place of `npm run bot:register`.
Problems specific to The Council:

| What you see | Fix |
|---|---|
| "…has no review channel" | `/council division` for that division (or, for a subdivision, for Judicial) with `review_channel` |
| "You have not been assigned to a division yet" | Their HR runs `/division assign` |
| "…has no ranks yet" | `/council rank add` for that division |
| A rank moved to the wrong division | A role can only sit on one ladder. Run `rank add` again with the right division |

## Where the code lives

| Path | What it is |
|---|---|
| [`src/app/api/discord/council/interactions/route.ts`](../src/app/api/discord/council/interactions/route.ts) | The endpoint Discord talks to |
| [`src/lib/council/divisions.ts`](../src/lib/council/divisions.ts) | The five divisions and how they connect |
| [`src/lib/council/permissions.ts`](../src/lib/council/permissions.ts) | Who can act in which division |
| [`src/lib/council/ranks.ts`](../src/lib/council/ranks.ts) | The ladders and the Enforcers/Legislators → Judicial step |
| [`src/lib/council/shift-points.ts`](../src/lib/council/shift-points.ts) | How shift time turns into points. Change the table here |
| [`src/lib/council/shifts.ts`](../src/lib/council/shifts.ts) | Starting, pausing, adjusting and ending shifts |
| [`src/lib/council/command-defs.ts`](../src/lib/council/command-defs.ts) | The command list. Edit it, then run `npm run council:register` |

The tables are all prefixed `Council` and are separate from The Engine's.
