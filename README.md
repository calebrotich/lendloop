# LendLoop

**Borrow what you need. Lend what you don't.**

LendLoop is a neighbourhood tool-lending board. Neighbours list the tools they are willing to
lend, borrowers ask for a date range, owners approve or decline, and [n8n](https://n8n.io)
automates the notifications and the overdue reminders in both directions.

> **Status: Stage 0a — scaffold only.** The Next.js shell, styling, health endpoint, secret
> scanner and test harness are in place. Authentication, data, and automation are being built
> stage by stage; see [`AGENTS.md`](AGENTS.md) for the build map and the requirement IDs.

## Stack

| Layer          | Choice                                                       |
| -------------- | ------------------------------------------------------------ |
| App            | Next.js 16 (App Router) · React 19 · TypeScript 5.9 (strict) |
| Styling        | Tailwind CSS v4                                              |
| Auth           | Clerk _(Stage 0b)_                                           |
| Data + backend | Convex _(Stage 0b)_                                          |
| Automation     | n8n 2.46 self-hosted via Docker Compose                      |
| Dev email      | Mailpit (SMTP sink, UI on :8025)                             |
| Tests          | Vitest · `convex-test` · Playwright                          |

## Quickstart

```bash
pnpm install
cp .env.example .env      # fill N8N_HMAC_SECRET and N8N_ENCRYPTION_KEY at minimum
docker compose up -d      # n8n :5678 · Mailpit :8025 · Postgres
pnpm dev                  # http://localhost:3000
```

The first visit to <http://localhost:5678> creates the n8n owner account. Generate the two
required secrets with `openssl rand -hex 32`; `compose.yml` refuses to start without them.

Clerk and Convex keys are not needed to boot the app shell. They are needed from Stage 0b, and
the values Convex must see are set on the deployment rather than in `.env`:

```bash
pnpm exec convex env set CLERK_JWT_ISSUER_DOMAIN '<value>'
```

## Commands

| Command                             | What it does                                              |
| ----------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                          | Next.js dev server                                        |
| `pnpm build`                        | Production build                                          |
| `pnpm check`                        | typecheck → lint → secret scan → unit tests (the CI gate) |
| `pnpm test`                         | Vitest only                                               |
| `pnpm format` / `pnpm format:check` | Prettier                                                  |
| `docker compose up -d`              | n8n + Postgres + Mailpit                                  |
| `pnpm exec convex dev`              | Convex functions + schema push _(from Stage 0b)_          |

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
