# Production note

LendLoop is live at <https://lendloopnow.vercel.app>.

Email is live: Convex renders every message and n8n sends it through Zoho SMTP from the
project's verified domain to real recipients. Local development uses Mailpit and never sends mail.

## What runs where

| Layer          | Production                                                           |
| -------------- | -------------------------------------------------------------------- |
| App            | Vercel — Next.js 16 App Router                                       |
| Data + backend | Convex Cloud — schema, functions, HTTP actions, crons                |
| Auth           | Clerk                                                                |
| Automation     | n8n 2.46 on a small VPS, Postgres 17, Caddy behind Cloudflare        |
| Email          | Zoho SMTP from the project's domain — live, real recipients          |
| Media          | Cloudflare R2 — public CDN host, uploads through a same-origin proxy |
| Monitoring     | Sentry (errors/replay) and PostHog (analytics/logs)                  |

The VPS is reachable only through Cloudflare; n8n binds to localhost and Postgres publishes no port.
Convex and n8n sign every call in both directions with HMAC, and the outbox retries with backoff.

## Already production-shaped

- **Authz in the backend.** Every user-reachable mutation checks identity and ownership or role in
  Convex, so the UI cannot grant access.
- **Reliable automation.** Mutations enqueue an outbox row in the same transaction; n8n drains it
  with retries, idempotency keys and a visible failure event.
- **Minimal data.** Public queries expose no owner identity, email or request details. Email
  payloads carry one recipient, the tool, the dates and a link.
- **Real media pipeline.** Uploads are proxied, size/type/magic verified, EXIF/GPS stripped and
  served from R2 with a one-day cache.
- **CI gate.** `pnpm check`, `format:check` and `build` run on every push.

## What I would change next

1. **Promote Convex from the `dev:` deployment** to a `prod:` deployment, with separate dev/prod
   data and a repeatable schema deploy.
2. **Harden the mail path.** Keep Zoho SPF/DKIM aligned, monitor bounces and complaints, and add a
   fallback provider for delivery failures.
3. **Move backups and alerts off the VPS.** Copy Postgres dumps to R2 or another host, and page on
   n8n or queue failures instead of relying on a local restart policy.
4. **Run n8n in queue mode** with external task runners and a managed Postgres, so a workflow burst
   cannot starve the editor or the schedule.
5. **Add edge protection.** Cloudflare WAF/rate limits on auth and upload routes, plus retention and
   audit-export rules for `auditLog` and `automationEvents`.
6. **Add the E2E happy path.** A browser test from public shelf → sign in → list → request → approve
   → notification event, run against a seeded preview deployment.
7. **Productise the money and trust layer.** Payments or deposits, ID verification, damage/dispute
   handling and clear lending terms are needed before real-world lending beyond neighbours.
