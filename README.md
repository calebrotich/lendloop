# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Neighbours list tools with a daily rate and a
replacement value; borrowers ask for a date range; owners approve, decline or mark the loan
returned. [n8n](https://n8n.io) carries the notifications and overdue reminders in both directions.

**Live:** <https://lendloopnow.vercel.app>

**Email is live.** Convex renders every message and n8n sends it through Zoho SMTP from
`lendloop@bahasha.app` to real recipients. Local development uses Mailpit and never sends mail.

## Project map

| Artifact                         | Where                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| Live app                         | <https://lendloopnow.vercel.app>                                                             |
| Source                           | this repository · [github.com/calebrotich/lendloop](https://github.com/calebrotich/lendloop) |
| n8n workflows                    | [`automation/workflows/`](automation/workflows) — W1, W2, W3                                 |
| Production note                  | [`docs/production.md`](docs/production.md)                                                   |
| Setup, architecture and security | this file                                                                                    |

## What it does

- **Public shelf** — landing page with search, category filter, real listing photography and
  shareable item pages at `/listings/[id]`.
- **Listing flow** — create, edit, pause and remove your own listings; up to six photos with a cover
  and gallery.
- **Requests** — a range calendar that blocks pending and approved bookings, a live incoming-request
  signal, and one shared board for My requests and Incoming.
- **Loan lifecycle** — approve, decline, withdraw, mark returned; both parties can close a loan.
- **Admin** — moderate any listing, view all loans, set a Trusted Lender flag, and read the audit
  trail and automation health.
- **Pricing** — USD daily rate plus replacement value, with the agreed values snapshotted on the
  request. Payment settles directly between neighbours; there is no payment processor.

## Stack

| Layer          | Choice                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| App            | Next.js 16 (App Router) · React 19 · TypeScript 5.9 (strict)            |
| Styling        | Tailwind CSS v4                                                         |
| Auth           | Clerk 7 (JWT template `convex`)                                         |
| Data + backend | Convex (schema, queries, mutations, actions, HTTP actions, crons)       |
| Automation     | n8n 2.46 self-hosted via Docker Compose                                 |
| Email          | Convex-rendered HTML → n8n SMTP (Mailpit locally, Zoho in production)   |
| Media          | Cloudflare R2 — presigned uploads, public CDN host                      |
| Observability  | Sentry 11 (errors, masked replay) · PostHog (analytics + logs, proxied) |
| Tests          | Vitest · `convex-test` — 191 tests, 1 opt-in R2 integration test        |

## Run locally

```bash
pnpm install
cp .env.example .env.local    # Next.js + Convex
cp .env.example .env          # Docker Compose
# fill both files; then:
docker compose up -d          # n8n :5678 · Mailpit :8025 · Postgres
pnpm exec convex dev          # first run: browser login, writes CONVEX_DEPLOYMENT
pnpm exec convex run seed:seedDemoShelf
pnpm exec convex run seed:seedDemoLoans
pnpm dev                      # http://localhost:3000
```

The automation stack needs a tunnel, one SMTP credential and three workflow imports. The exact steps
are in [`docs/n8n.md`](docs/n8n.md). Two env files exist because two tools own them: `.env.local` is
read by Next.js, `.env` by Docker Compose. Convex functions cannot read either, so their values are
set on the deployment.

## Configuration

- **`.env.local`** — Clerk publishable/secret keys and the Convex URL written by `convex dev`.
- **`.env`** — Compose only: `N8N_ENCRYPTION_KEY`, `POSTGRES_PASSWORD`, `N8N_HMAC_SECRET`,
  `LENDLOOP_MAIL_FROM`.
- **Convex deployment** — `CLERK_JWT_ISSUER_DOMAIN`, `N8N_HMAC_SECRET` (same value as `.env`),
  `N8N_REQUEST_WEBHOOK_URL`, `N8N_ERROR_WEBHOOK_URL`, `APP_BASE_URL`, `ADMIN_EMAIL_ALLOWLIST`, and
  the five `R2_*` values.

Every variable is documented in [`.env.example`](.env.example). Set a deployment value with
`pnpm exec convex env set KEY value`; never commit a filled env file.

## Architecture

```text
Browser ─┬─> Next.js + Clerk ─────────> Convex (schema, authz, crons, actions)
         └─> /api/media/upload ───────> Cloudflare R2

Convex outbox ─> signed webhook ──────> n8n ─> SMTP (Mailpit locally, Zoho in production)
n8n ─> signed Convex HTTP actions (overdue fetch, reminder write-back, automation events)
```

Convex owns all state and authorization. Notifications are written to an outbox in the same
transaction as the status change, then drained by n8n with retries and a visible audit trail.

## Security and data minimisation

- **Authorization lives in Convex functions**, never only in the UI. Every user-reachable mutation
  checks the caller's identity and the ownership or role the action requires.
- **Both directions are HMAC-signed** with a 300-second timestamp window and a timing-safe compare.
  Signatures are verified before parsing or any side effect.
- **Failures are visible.** The outbox retries with backoff, permanent failures become events, the
  loan feed shows the automation trail, and W3 alerts the operator.
- **Public reads are narrow.** `tools.listPublic` returns only name, category and a cover summary.
  The item page adds description, condition, a Trusted Lender flag and busy date ranges — never the
  owner's identity, email or request details.
- **Notification payloads are minimal**: one recipient address, tool, dates and a deep link. No
  descriptions, third-party addresses or internal IDs.
- **Photos are validated server-side** (size, content type, magic bytes), resized and re-encoded
  client-side to strip EXIF/GPS. R2 credentials stay on the Convex deployment.
- **Analytics is privacy-conscious**: Sentry has user data, cookies, headers, query strings and
  bodies disabled with masked replay; PostHog is served through a same-origin proxy.

## Automation (n8n)

| Workflow                      | Trigger                                  | What it does                                                                    |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| **W1** `request-notification` | Convex webhook                           | Verifies HMAC, emails the owner on a new request and the borrower on a decision |
| **W2** `overdue-reminders`    | Daily 09:00 `Africa/Nairobi`             | Fetches overdue loans, emails each borrower, writes the reminder back           |
| **W3** `error-handler`        | n8n Error Trigger + Convex alert webhook | Records failures in Convex and emails the operator                              |

Every call is signed `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`. Convex mutations only enqueue
an outbox row; a cron drains it with 1m→30m backoff and six attempts, so a request cannot be
approved without its notification being queued and a delivery failure cannot be silent. The
contract, local setup and failure playbook are in [`docs/n8n.md`](docs/n8n.md).

## Seed the shelf

`convex/seed.ts` is the tiny demo shelf for local work. The **production shelf** is built from
`scripts/seed/catalog/*.json`: 136 realistic listings across 14 categories, each with one to three
photos in R2, distributed across the deployment's real accounts. The whole dataset is reproducible:

```bash
node scripts/seed/build-catalog.mjs        # validate + merge the catalogue
python3 scripts/seed/fetch-images.py       # pick photos, resize/convert to WebP (.seed-cache/)
node scripts/seed/generate-convex-data.mjs # write convex/seedData.ts + lib/image-credits.ts
node scripts/seed/upload-r2.mjs            # upload the WebP files to R2 (idempotent)
```

Then deploy and run the operator mutation with the owner emails (they must already exist in
`users` — signing in once creates the row):

```bash
pnpm exec convex deploy
pnpm exec convex run seedProd:seedProduction \
  '{"ownerEmails":["calebrotich10@gmail.com","bahasha.app@gmail.com","crotich3@gmail.com","lendloop@bahasha.app"]}'
```

`seedProduction` is idempotent by (owner, exact name) and runs in one transaction, so re-running
repairs a partial seed instead of duplicating it. `seedProd:removeProductionSeed` reverses it;
add `"deleteObjects":true` to queue the R2 objects as well (the bucket is shared with dev, so
that is opt-in). Photos are from Wikimedia Commons under public domain, CC0, CC BY or CC BY-SA,
and every credit is rendered at [`/credits`](app/credits/page.tsx).

## Verify

```bash
pnpm check        # typecheck → lint → secret scan → 191 tests
pnpm test         # Vitest only
pnpm build        # production build
pnpm format:check
```

CI runs `pnpm check`, `pnpm format:check` and `pnpm build`. The only skipped test is the opt-in live
R2 check (`R2_INTEGRATION=1`).

## Docs

- [`docs/n8n.md`](docs/n8n.md) — workflow contract, signing, local setup, failure playbook.
- [`docs/production.md`](docs/production.md) — production shape, live email and next hardening
  steps.
- [`docs/media-storage.md`](docs/media-storage.md) — R2 upload flow, limits and housekeeping.

## License

Portfolio project. LendLoop is a fictional product; the seed data is invented.
