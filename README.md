# SCiP.net

A terminal-styled member portal for an SCP Foundation roleplay faction: invite-code
registration, a 7-tier clearance system, personnel files, private messages, a
clearance-gated SCP file archive, broadcasts, and clearance-change requests.

Built with Next.js (App Router), Prisma, Turso (libSQL), and Auth.js.

## Local development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in the values (a local SQLite file works out
   of the box — no Turso account needed for development):
   ```bash
   cp .env.example .env
   ```
   Set `AUTH_SECRET` to a random string (e.g. `openssl rand -base64 32`).
3. Push the schema and seed the owner account:
   ```bash
   npm run db:push
   npm run db:seed
   ```
   This prints the owner's login email and one-time codeword password, plus an
   initial invite code — copy both down, they are not shown again.
4. Start the dev server:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000, log in as the owner, and use the ADMIN panel to
   generate more invite codes for other members to register with.

## Deploying to Vercel + Turso

SQLite's local file can't survive Vercel's ephemeral filesystem, so production uses
[Turso](https://turso.tech) (hosted libSQL) instead — the same Prisma schema and
`@prisma/adapter-libsql` client work against it unchanged.

1. Create a Turso database and auth token:
   ```bash
   turso db create scip-net
   turso db show scip-net --url
   turso db tokens create scip-net
   ```
2. In the Vercel project settings, set these environment variables:
   - `DATABASE_URL` — the `libsql://...` URL from `turso db show`
   - `TURSO_AUTH_TOKEN` — the token from `turso db tokens create`
   - `AUTH_SECRET` — a random string (generate a new one for production)
   - `OWNER_EMAIL` — the owner login you want seeded (optional, defaults to
     `owner@foundation.scp`)
3. Push the schema to the Turso database and seed the owner account, pointing the
   CLI at production by exporting the same env vars locally, then running:
   ```bash
   npm run db:push
   npm run db:seed
   ```
4. Deploy the project to Vercel as usual (`vercel` or via the dashboard/Git
   integration). No other configuration is required.

## How clearance works

Ranks run 1–7, labeled L-1 through L-5, then L-O5, then L-OMNI (rank 7 — reserved
for the single owner account). The owner adjusts anyone's clearance from `/admin`,
which also handles inviting new members, granting/revoking SCP-file posting rights,
and approving/denying clearance-change requests submitted via `/clearance-request`.
