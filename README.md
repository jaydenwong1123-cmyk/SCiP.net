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
3. Create the schema and seed the owner account:
   ```bash
   npm run db:deploy
   npm run db:seed
   ```
   This prints the owner's login email and one-time codeword password, plus an
   initial invite code — copy both down, they are not shown again.

   Use `npm run db:migrate` when you change `prisma/schema.prisma`; it creates a
   migration in `prisma/migrations/` and applies it. `npm run db:push` still
   exists for throwaway experiments, but anything you intend to keep needs a
   migration, or it cannot be applied to production.
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
3. Create the schema and seed the owner account, pointing the CLI at production
   by exporting the same env vars locally, then running:
   ```bash
   npm run db:deploy
   npm run db:seed
   ```
4. Deploy the project to Vercel as usual (`vercel` or via the dashboard/Git
   integration).

### Applying schema changes to production

**Read this before you ship a migration.** The build script runs
`prisma migrate deploy`, but whether that reaches production depends on one
Vercel setting:

- If `DATABASE_URL` is marked **Sensitive** in Vercel, it is *not exposed to the
  build*. `prisma.config.ts` then falls back to `file:./prisma/dev.db` and the
  build silently migrates a throwaway file inside the build container. The build
  succeeds, the deploy goes out, and production is left behind — which will crash
  any page whose queries need the new columns.
- If it is **not** marked Sensitive, the build migrates production on every
  deploy and there is nothing else to do.

To check: `npx vercel env ls production`. If `DATABASE_URL` shows as `Sensitive`,
either un-mark it (delete and re-add without the Sensitive box ticked), or apply
migrations by hand **before** deploying:

```bash
export DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..."
npm run db:baseline   # only needed once, on a database built by `db push`
npm run db:deploy
```

`db:baseline` records `0_init` as already applied, for a database whose tables
were created by the old `db push` flow and which therefore has no
`_prisma_migrations` table. It is idempotent and refuses to run against a
partially-built database.

### Backups

Turso holds the only copy of everything, and OMEGA AUTHORITY includes an
irreversible purge — so take an export before anything destructive:

```bash
export DATABASE_URL="libsql://..." TURSO_AUTH_TOKEN="..."
npm run db:backup
```

The owner can also download one from `/admin/omega/backup` in the running app.
A backup file contains password hashes, invite codes, the maintenance bypass code
and every private message on the site. Treat it exactly like the database.

## How clearance works

Ranks run 1–7, labeled L-1 through L-5, then L-O5, then L-OMNI (rank 7 — reserved
for the single owner account). The owner adjusts anyone's clearance from `/admin`,
which also handles inviting new members, granting/revoking SCP-file posting rights,
and approving/denying clearance-change requests submitted via `/clearance-request`.
