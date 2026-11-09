# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Neighbours list the tools they are willing to
lend, borrowers ask for a date range, owners approve or decline, and [n8n](https://n8n.io)
automates the notifications and the overdue reminders in both directions.

> **Status: Stage 6 in progress — hardening.** Automation is complete (n8n in both directions,
> HMAC, outbox, error workflow) and Sentry reports errors from the server, edge and browser. The
> public and authenticated experiences are now designed end to end: a landing page with a
> three-part search and category shelf, public item pages at `/listings/[id]`, a range calendar
> that shows pending and approved bookings, per-day pricing with a booking total, a live incoming-
> request signal, and a request board shared by My requests and Incoming. Remaining: the Playwright
> happy path and the production note.

## Stack

| Layer          | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| App            | Next.js 16 (App Router) · React 19 · TypeScript 5.9 (strict) |
| Styling        | Tailwind CSS v4                                              |
| Auth           | Clerk 7 (JWT template `convex`)                              |
| Data + backend | Convex (schema v1 · dev deployment)                          |
| Automation     | n8n 2.46 self-hosted via Docker Compose                      |
| Dev email      | Mailpit (SMTP sink, UI on :8025)                             |
| Monitoring     | Sentry 11 — errors, traces, masked session replay            |
| Media          | Cloudflare R2 (S3 API) — presigned uploads, public CDN host  |
| Tests          | Vitest · `convex-test` · Playwright                          |

## Quickstart

```bash
pnpm install
cp .env.example .env.local    # app + Convex: Clerk keys, Convex URLs
cp .env.example .env          # compose: n8n encryption key, Postgres, SMTP
docker compose up -d          # n8n :5678 · Mailpit :8025 · Postgres
pnpm exec convex dev          # first run: browser login, writes CONVEX_DEPLOYMENT
pnpm exec convex run seed:seedDemoShelf   # six demo tools, safe to re-run
pnpm exec convex run seed:seedDemoLoans   # pending + upcoming + overdue loan
pnpm dev                      # http://localhost:3000
```

The automation stack needs one more pass — a tunnel, five Convex env vars, an SMTP credential and
the three workflow imports. It is written out step by step in [`docs/n8n.md`](docs/n8n.md).

Two env files because two tools own them: `.env.local` is written by the Convex CLI and read by
Next.js, `.env` is read by `docker compose`. Both are gitignored. Anything Convex functions read is
set on the deployment instead, because functions cannot see either file:

```bash
pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN '<value>'
pnpm exec convex env set ADMIN_EMAIL_ALLOWLIST 'you@example.com'
pnpm exec convex run admin:promoteFromAllowlist   # promote existing accounts to admin

# Listing photos (Cloudflare R2)
pnpm exec convex env set R2_BUCKET_NAME '<bucket>'
pnpm exec convex env set R2_ACCOUNT_ID '<cloudflare-account-id>'
pnpm exec convex env set R2_ACCESS_KEY_ID '<access-key-id>'
pnpm exec convex env set R2_SECRET_ACCESS_KEY '<secret-access-key>'
pnpm exec convex env set R2_PUBLIC_HOST 'cdn.example.com'
pnpm exec convex run media:verifyStorage          # presign → PUT → verify → delete
```

The first visit to <http://localhost:5678> creates the n8n owner account. Generate the two
compose secrets with `openssl rand -hex 32`; `compose.yml` refuses to start without them.

## Commands

| Command                                                                                          | What it does                                              |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `pnpm dev`                                                                                       | Next.js dev server                                        |
| `pnpm build`                                                                                     | Production build                                          |
| `pnpm check`                                                                                     | typecheck → lint → secret scan → unit tests (the CI gate) |
| `pnpm test`                                                                                      | Vitest only                                               |
| `pnpm format` / `pnpm format:check`                                                              | Prettier                                                  |
| `docker compose up -d`                                                                           | n8n + Postgres + Mailpit                                  |
| `pnpm exec convex dev`                                                                           | Convex functions + schema push                            |
| `pnpm exec convex run seed:seedDemoShelf`                                                        | Seed the demo shelf (idempotent, internal mutation)       |
| `pnpm exec convex run seed:seedDemoLoans`                                                        | Seed pending/upcoming/overdue demo loans                  |
| `pnpm exec convex run migrations:backfillPricing`                                                | Price listings created before pricing existed             |
| `pnpm exec convex run media:verifyStorage`                                                       | Live R2 smoke test (presign → PUT → verify → delete)      |
| `docker compose run --rm --no-deps --entrypoint n8n n8n execute --id=lendloop-overdue-reminders` | Run W2 now (manual trigger)                               |

## Pricing and requests

Owners set a **daily rate** for each listing and a **replacement value**. The value drives the
recommended 3–5% rate band (4% one-tap) and is the amount a borrower agrees to reimburse if the
item is lost or not returned. A listing may be free. The rate is shown on every card, the detail
page, the date picker and the request form, and the booking total is the rate × the days
requested. The replacement value is shown on the detail page, the request form, the request card
and in notification email. Both the agreed rate and the value are snapshotted on the request, so
editing a listing later does not rewrite an existing booking. Pricing is informational for now:
neighbours settle directly, with no payment processor. Amounts are in USD.

`/my-requests` and `/incoming-requests` share one board: cover photos, booking totals, trusted
neighbour badges, filters, search, and a collapsed notification trail. A signed-in owner sees an
incoming count in both headers and a strip as soon as they land, so a pending request is never
buried behind a page navigation.

## Listing photos (Cloudflare R2)

Listings can carry up to **six photos**. Owners add, remove and promote a cover from **My listings**;
the cover is shown on the public shelf, and the full set opens in the gallery on the public item page.

- **Upload path:** browser → same-origin `/api/media/upload` → R2. Convex mints a short-lived
  presigned PUT scoped to the caller's own upload ticket; the Next.js route authenticates Clerk,
  checks the declared size, and forwards the bytes. R2 credentials never reach the browser, and the
  bucket needs **no public CORS rule**.
- **Server-side verification:** `completeUpload` HEADs the stored object, compares size and content
  type with the ticket, and reads the first bytes to confirm the image signature before inserting a
  `toolImages` row. An SVG or an HTML payload labelled as a photo is rejected and deleted.
- **Preview:** a local preview appears the moment a file is selected; the upload then prepares,
  uploads and verifies it. HEIC/HEIF sources are accepted where the browser can decode them.
- **Privacy:** the browser resizes each file and re-encodes it before upload, which strips EXIF/GPS
  metadata. Photos are served from the public `R2_PUBLIC_HOST`, so they are public by design; the
  UI says so next to the picker. Cache TTL is one day, so a deleted photo leaves edge caches within
  a day while the object itself is removed by the media cron.
- **Delivery:** `next/image` optimises the stored photo per viewport (AVIF/WebP) through
  `/_next/image`. `R2_PUBLIC_HOST` is allow-listed in `next.config.ts`; without it the app falls
  back to unoptimised URLs rather than breaking. The original object stays the source of truth.
- **Reliability:** deletes go through a `storageDeletes` outbox drained every 15 minutes with
  backoff; expired upload tickets and their orphaned objects are cleaned up by the same cron.
- **Limits:** 6 per listing · 4 MB after client re-encode · JPEG, PNG, WebP or AVIF · SVG excluded.

Full design, operations and failure modes: [`docs/media-storage.md`](docs/media-storage.md).

## Repository layout

```
app/                 Next.js App Router — landing, /listings/[id], (app) routes, /api/health
components/          shared client UI — forms, image manager, gallery, status views
convex/              schema, queries, mutations, actions, httpActions, crons
automation/workflows exported, sanitised n8n workflow JSON
docs/                architecture, security, media, n8n contract, production readiness
scripts/             secret scanner, seed
tests/               Vitest suites; Playwright specs later
compose.yml          n8n 2.46 + Postgres 16 + Mailpit, bound to 127.0.0.1
```

## Automation (n8n)

Three committed workflows in `automation/workflows/`:

| Workflow                      | Trigger                                  | What it does                                                                    |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| **W1** `request-notification` | Convex webhook                           | Verifies HMAC, emails the owner on a new request and the borrower on a decision |
| **W2** `overdue-reminders`    | Daily 09:00 `Africa/Nairobi`             | Fetches overdue loans, emails each borrower, writes the reminder back           |
| **W3** `error-handler`        | n8n Error Trigger + Convex alert webhook | Records failures in Convex and emails the operator                              |

```bash
docker compose run --rm --no-deps --entrypoint n8n n8n execute --id=lendloop-overdue-reminders
open http://localhost:8025   # the reminder email, in Mailpit
```

Every call is signed `HMAC-SHA256(secret, "${timestamp}.${rawBody}")` and verified before any side
effect, in both directions. Convex mutations only enqueue an outbox row; a cron drains it with
backoff and records every outcome, so a request cannot be approved without its notification being
queued and a delivery failure cannot be silent. The full contract, setup and failure playbook are in
[`docs/n8n.md`](docs/n8n.md).

## Observability

Sentry is wired through Next's App Router hooks:

- `instrumentation.ts` initialises the server and edge SDKs and forwards `onRequestError`;
  `instrumentation-client.ts` initialises the browser SDK, Replay and router transitions.
- `app/global-error.tsx` captures render failures, so an error before the app shell still reports.
- Source maps upload during `pnpm build` when `SENTRY_AUTH_TOKEN` is present (a CI secret). Without
  it the build still succeeds; the upload is skipped.
- `/monitoring` tunnels browser traffic through Next so ad-blockers do not drop it, and it is
  excluded from the Clerk proxy matcher so envelopes are never redirected to sign-in.
- **Privacy:** `sendDefaultPii` is off and user info, cookies, headers, query strings and HTTP
  bodies are all disabled. Replay masks every text node and input, and blocks media. Convex
  functions are not instrumented by the Next SDK — their trail is `automationEvents` plus the admin
  health panel.
- The DSN is a public client key with a built-in fallback; `NEXT_PUBLIC_SENTRY_DSN` (browser) or
  `SENTRY_DSN` (server) point a fork at its own project. `SENTRY_ORG` / `SENTRY_PROJECT` do the same
  for source-map upload.

## Security posture (short version)

- Authorization is enforced in **Convex functions** — the UI never decides access.
- Every Convex → n8n and n8n → Convex call is **HMAC-signed** with a timestamp window; inbound
  verification happens before parsing or any database write.
- Mutations write to an **outbox**; the drain retries with backoff, and permanent failures surface in
  the loan's activity feed and the admin health panel.
- `secrets:check` runs in CI and fails on credential-shaped strings or a committed `.env`.
- Notification payloads are **minimised**: a name, a tool, a date range, a deep link. No
  third-party emails, no descriptions.
- Listing photos are **validated server-side** (content type, byte size, magic bytes) before they
  become visible; R2 credentials exist only on the Convex deployment, and the upload proxy needs no
  bucket CORS. Photos are public, resized and re-encoded (EXIF stripped) client-side.
- The public item page exposes only what a listing needs to be understood: name, category,
  condition, description, a “Trusted lender” flag, derived availability and **busy date ranges**
  (pending + approved, never who asked). No owner id, email or any part of the owner's name —
  trusted owners are marked, not named. No request details. The original minimal
  `tools.listPublic` projection is still there for the T3 contract.
- Sentry is configured **not** to collect user fields, cookies, headers, query strings or bodies,
  and Replay masks the UI.
- Dependencies are pinned; TypeScript is held at 5.9 because `typescript-eslint` does not yet
  support the 7.x compiler line.

The full threat model lands in `docs/security.md` (Stage 6). Until then, the security section above
and [`docs/n8n.md`](docs/n8n.md) are the source of truth.

## License

Private take-home project. Fictional product; seed data is invented.
