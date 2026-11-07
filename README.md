# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Neighbours list the tools they are willing to
lend, borrowers ask for a date range, owners approve or decline, and [n8n](https://n8n.io)
automates the notifications and the overdue reminders in both directions.

> **Status: Stage 5 — automation.** n8n now sends request notifications and overdue reminders in
> both directions, with HMAC-signed calls, an outbox with retries, idempotent write-backs and an
> error workflow. See [`docs/n8n.md`](docs/n8n.md).

## Stack

| Layer          | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| App            | Next.js 16 (App Router) · React 19 · TypeScript 5.9 (strict) |
| Styling        | Tailwind CSS v4                                              |
| Auth           | Clerk 7 (JWT template `convex`)                              |
| Data + backend | Convex (schema v1 · dev deployment)                          |
| Automation     | n8n 2.46 self-hosted via Docker Compose                      |
| Dev email      | Mailpit (SMTP sink, UI on :8025)                             |
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
| `docker compose run --rm --no-deps --entrypoint n8n n8n execute --id=lendloop-overdue-reminders` | Run W2 now (manual trigger)                               |

## Repository layout

```
app/                 Next.js App Router — public page, (app) routes, /api/health
components/          shared UI (added as the app grows)
convex/              schema, queries, mutations, httpActions, crons
automation/workflows exported, sanitised n8n workflow JSON
docs/                architecture, security, n8n contract, production readiness
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

## Security posture (short version)

- Authorization is enforced in **Convex functions** — the UI never decides access.
- Every Convex → n8n and n8n → Convex call is **HMAC-signed** with a timestamp window; inbound
  verification happens before parsing or any database write.
- Mutations write to an **outbox**; the drain retries with backoff, and permanent failures surface in
  the loan's activity feed and the admin health panel.
- `secrets:check` runs in CI and fails on credential-shaped strings or a committed `.env`.
- Notification payloads are **minimised**: a name, a tool, a date range, a deep link. No
  third-party emails, no descriptions.
- Dependencies are pinned; TypeScript is held at 5.9 because `typescript-eslint` does not yet
  support the 7.x compiler line.

The full threat model lands in `docs/security.md` (Stage 6). Until then, the security section above
and [`docs/n8n.md`](docs/n8n.md) are the source of truth.

## License

Private take-home project. Fictional product; seed data is invented.
