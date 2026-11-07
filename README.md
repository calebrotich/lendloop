# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Neighbours list the tools they are willing to
lend, borrowers ask for a date range, owners approve or decline, and [n8n](https://n8n.io)
automates the notifications and the overdue reminders in both directions.

> **Status: Stage 0b — auth and identity are wired.** Signing in through Clerk provisions a Convex
> `users` row; the public page is shell-only and gets real tool data in Stage 1. Authorisation
> already lives in Convex (`users.ensureCurrent` rejects anonymous callers on the live deployment).
> See [`AGENTS.md`](AGENTS.md) for the build map and requirement IDs.

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
pnpm dev                      # http://localhost:3000
```

Two env files because two tools own them: `.env.local` is written by the Convex CLI and read by
Next.js, `.env` is read by `docker compose`. Both are gitignored. Anything Convex functions read is
set on the deployment instead, because functions cannot see either file:

```bash
pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN '<value>'
pnpm exec convex env set ADMIN_EMAIL_ALLOWLIST 'you@example.com'
```

The first visit to <http://localhost:5678> creates the n8n owner account. Generate the two
compose secrets with `openssl rand -hex 32`; `compose.yml` refuses to start without them.

## Commands

| Command                             | What it does                                              |
| ----------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                          | Next.js dev server                                        |
| `pnpm build`                        | Production build                                          |
| `pnpm check`                        | typecheck → lint → secret scan → unit tests (the CI gate) |
| `pnpm test`                         | Vitest only                                               |
| `pnpm format` / `pnpm format:check` | Prettier                                                  |
| `docker compose up -d`              | n8n + Postgres + Mailpit                                  |
| `pnpm exec convex dev`              | Convex functions + schema push                            |

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
AGENTS.md            internal build map: requirements, RBAC matrix, stages
```

## Security posture (short version)

- Authorization is enforced in **Convex functions** — the UI never decides access.
- Every Convex → n8n and n8n → Convex call is **HMAC-signed** with a timestamp window.
- `secrets:check` runs in CI and fails on credential-shaped strings or a committed `.env`.
- Notification payloads are **minimised**: a name, a tool, a date range, a deep link. No
  third-party emails, no descriptions.
- Dependencies are pinned; TypeScript is held at 5.9 because `typescript-eslint` does not yet
  support the 7.x compiler line.

The full threat model lands in `docs/security.md` (Stage 6). Until then, `AGENTS.md` §7–§8 is
the source of truth.

## License

Private take-home project. Fictional product; seed data is invented.
