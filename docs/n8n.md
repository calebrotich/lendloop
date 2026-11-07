# n8n integration

The single source of truth for the automation layer: what runs, what is signed,
how to bring it up locally, and what to do when it misbehaves. The executable copy
of the contract is `convex/lib/n8n.ts`; the workflows are
`automation/workflows/*.json`.

## What runs where

| Workflow                      | File                        | Trigger                                                                | Does                                                                                                                |
| ----------------------------- | --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **W1 · request-notification** | `request-notification.json` | Webhook `POST /webhook/lendloop-request`                               | Verifies HMAC, emails the owner or borrower for a loan event                                                        |
| **W2 · overdue-reminders**    | `overdue-reminders.json`    | Schedule, daily 09:00 `Africa/Nairobi` (+ a manual trigger for demos)  | Fetches overdue loans, emails each borrower, writes the reminder back, posts a run summary                          |
| **W3 · error-handler**        | `error-handler.json`        | n8n Error Trigger **and** webhook `POST /webhook/lendloop-error-alert` | Records workflow errors in Convex and emails `LENDLOOP_OPS_EMAIL`; also receives Convex's permanent-delivery alerts |

Convex never calls W3 on its own error path except through the outbox alert: when
a notification exhausts six attempts, Convex writes an `automation.failed` event
and queues one signed alert to `N8N_ERROR_WEBHOOK_URL` (the W3 webhook). Alert
rows never spawn further alerts.

## Signing (both directions)

```
X-LendLoop-Timestamp: 1763000000            # unix seconds
X-LendLoop-Signature: v1=<64 hex chars>     # HMAC-SHA256(secret, `${timestamp}.${rawBody}`)
X-LendLoop-Idempotency-Key: request:<id>:approved   # informational on inbound calls
```

- The shared secret is `N8N_HMAC_SECRET` (32+ random bytes, e.g. `openssl rand -hex 32`).
  Convex reads it from its deployment env; n8n reads it as `$env.LENDLOOP_HMAC_SECRET`.
  Compose maps one to the other, so `.env` is the only value an operator edits.
- The verifier rejects a timestamp more than `SIGNATURE_TOLERANCE_SECONDS` (default 300) away from its own clock, in either direction, then compares digests with a
  constant-time comparison.
- **Verify before side effects.** W1/W3 verify before any email; Convex verifies
  before parsing the body or touching the database.
- n8n's Code node has no WebCrypto. `compose.yml` sets
  `NODE_FUNCTION_ALLOW_BUILTIN=crypto` (one module, never `*`) so the workflows can
  use `require('crypto')`. See `docs/spikes/stage-5-raw-body-and-tunnel.md`.
- The raw body is `binary.data.data` (base64) on the Webhook node. `$json.body` is
  the _parsed_ object and must never be re-serialised to check a signature.

## Contract

### Convex → W1 (`POST {N8N_REQUEST_WEBHOOK_URL}`)

```json
{
  "event": "request.approved",
  "idempotencyKey": "request:j57abc...:approved",
  "occurredAt": 1763000000000,
  "recipient": { "name": "Sam", "email": "sam@example.test" },
  "tool": { "name": "Cordless drill" },
  "window": { "start": "2026-11-20", "end": "2026-11-22" },
  "deepLink": "http://localhost:3000/my-requests?request=j57abc..."
}
```

`event` is one of `request.created`, `request.approved`, `request.declined`,
`request.cancelled`, `request.returned`. Who receives it:

| Event                                         | Recipient  | Why                              |
| --------------------------------------------- | ---------- | -------------------------------- |
| `request.created`                             | tool owner | they must approve or decline     |
| `request.approved` / `declined` / `cancelled` | borrower   | the decision affects their plans |
| `request.returned`                            | tool owner | the tool is back and relisted    |

Data minimisation is deliberate: the payload has one recipient's own address, the
tool name, the dates and a link. No descriptions, no third-party emails, no
internal user IDs. The owner sees the borrower's name in the app, not in the
email, so the email only has to prompt an action.

W1 responds `200 {"ok":true}` after the email is sent, `401 {"error":"unauthorized"}`
if the signature fails, and a 5xx if the email fails — a 5xx is what makes the
Convex outbox retry.

### W2 → Convex (`POST {CONVEX_SITE_URL}/n8n/overdue-loans`)

Body `{ "asOf": 1763000000000 }` (optional; defaults to now). Response:

```json
{
  "asOf": 1763000000000,
  "loans": [
    {
      "loanRequestId": "j57abc...",
      "toolName": "Cordless drill",
      "borrowerName": "Sam",
      "borrowerEmail": "sam@example.test",
      "startDate": 1762560000000,
      "endDate": 1762828800000,
      "daysOverdue": 3,
      "dueDate": "2026-11-04"
    }
  ]
}
```

Only approved loans past their end date, with a deliverable address, up to 50 per
run. `daysOverdue` is a calendar-day difference.

### W2 → Convex (`POST {CONVEX_SITE_URL}/n8n/reminders`)

```json
{
  "loanRequestId": "j57abc...",
  "kind": "overdue_reminder",
  "dayOffset": 3,
  "dueDate": "2026-11-04",
  "channel": "email",
  "status": "sent",
  "sentAt": 1763000000000
}
```

Convex derives the idempotency key itself — `reminder:<loanId>:<dueDate>:<dayOffset>`
— instead of trusting a client value, so a bug in one expression cannot collide
two loans. A duplicate returns `200 {"ok":true,"accepted":true,"deduped":true}`
and writes nothing. A loan that was returned between the fetch and the write-back
returns `accepted:false` with 200, so n8n does not retry a reminder nobody needs.

### W2/W3 → Convex (`POST {CONVEX_SITE_URL}/n8n/automation-events`)

```json
{
  "kind": "workflow.error",
  "workflow": "W2 · overdue-reminders",
  "executionId": "15",
  "occurredAt": 1763000000000,
  "message": "The host is unreachable, perhaps the server is offline"
}
```

`kind` is `workflow.error` or `workflow.summary`; summaries carry
`counts: { sent, failed }`. Dedupe is per `executionId`, so a retried report is a
200 with `deduped: true`, not a duplicate row. An error is recorded with status
`failed`, which surfaces in the admin health panel and in the loan's feed when
`loanRequestId` is present.

### Status codes

| Code | Meaning                                    | n8n behaviour                    |
| ---- | ------------------------------------------ | -------------------------------- |
| 200  | accepted (possibly deduped)                | continue                         |
| 400  | valid signature, invalid JSON/shape        | do not retry; fix the expression |
| 401  | missing/bad signature, stale timestamp     | do not retry; check the secret   |
| 503  | Convex has no `N8N_HMAC_SECRET` configured | fix env, then retry              |

## Local setup

Prereqs: the compose stack is up (`docker compose up -d`), Convex is deployed
(`pnpm exec convex dev`), and `.env` has `N8N_HMAC_SECRET`,
`POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`, `CONVEX_SITE_URL`, `APP_BASE_URL`.

1. **Tunnel** (Convex Cloud cannot reach `localhost`):

   ```bash
   printf '{}' > /tmp/cloudflared-empty.yml
   cloudflared tunnel --config /tmp/cloudflared-empty.yml --url http://localhost:5678
   ```

   The `--config` is not optional on a machine that already has
   `~/.cloudflared/config.yml`; without it the named tunnel's ingress wins and
   every quick-tunnel request returns 404. Use the printed
   `https://<name>.trycloudflare.com` below.

2. **Convex deployment env** — functions cannot read `.env`:

   ```bash
   pnpm exec convex env set N8N_HMAC_SECRET "$(sed -n 's/^N8N_HMAC_SECRET=//p' .env)"
   pnpm exec convex env set N8N_REQUEST_WEBHOOK_URL 'https://<tunnel>/webhook/lendloop-request'
   pnpm exec convex env set N8N_ERROR_WEBHOOK_URL   'https://<tunnel>/webhook/lendloop-error-alert'
   pnpm exec convex env set APP_BASE_URL 'http://localhost:3000'
   pnpm exec convex env set SIGNATURE_TOLERANCE_SECONDS '300'
   ```

3. **SMTP credential** (once): n8n → Credentials → New → SMTP, named
   **LendLoop Mailpit**, host `mailpit`, port `1025`, SSL/TLS off, STARTTLS
   disabled, user and password empty. The committed JSON references it by name
   and id (`lendloop-mailpit`); the values never enter git.

   CLI equivalent (write the file outside the repo):

   ```bash
   docker compose exec -T n8n n8n import:credentials --input=/tmp/mailpit.json
   ```

4. **Import and publish** the workflows. Import order does not matter — every id
   is stable, and W1/W2 already point at `settings.errorWorkflow =
"lendloop-error-handler"`:

   ```bash
   docker cp automation/workflows/. lendloop-n8n:/tmp/workflows/
   docker compose exec n8n n8n import:workflow --input=/tmp/workflows/request-notification.json
   docker compose exec n8n n8n import:workflow --input=/tmp/workflows/overdue-reminders.json
   docker compose exec n8n n8n import:workflow --input=/tmp/workflows/error-handler.json
   docker compose exec n8n n8n publish:workflow --id=lendloop-request-notification
   docker compose exec n8n n8n publish:workflow --id=lendloop-overdue-reminders
   docker compose exec n8n n8n publish:workflow --id=lendloop-error-handler
   docker compose restart n8n      # webhooks and schedules register on boot
   ```

5. **Prove it**:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5678/webhook/lendloop-request
   # 401 — unsigned requests are rejected before any side effect

   docker compose run --rm --no-deps --entrypoint n8n n8n execute --id=lendloop-overdue-reminders
   open http://localhost:8025      # the reminder email
   ```

   The manual trigger on W2 exists for this command and for the editor's
   "Execute workflow"; the daily schedule remains the real trigger.

## Failure playbook

| Symptom                                                  | Likely cause                                                               | Action                                                                                                |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Every quick-tunnel URL returns 404, including `/healthz` | `~/.cloudflared/config.yml` ingress is being merged                        | restart cloudflared with `--config` pointing at an empty file                                         |
| W1 returns 401 for Convex's calls                        | the secrets differ between `.env`, the Convex deployment and the container | `docker compose exec n8n printenv LENDLOOP_HMAC_SECRET` vs `pnpm exec convex env get N8N_HMAC_SECRET` |
| Outbox `lastError: HTTP 404`                             | stale tunnel hostname, or the workflow is not published                    | re-run step 1 and re-set `N8N_REQUEST_WEBHOOK_URL`; publish W1                                        |
| Outbox `lastError: missing webhook URL`                  | `N8N_REQUEST_WEBHOOK_URL` unset on the deployment                          | step 2                                                                                                |
| Outbox stuck `pending`, attempts climbing                | n8n is down or unreachable                                                 | `docker compose ps`; the backoff is 1m→2m→5m→15m→30m, then failed + W3 alert                          |
| W2 runs but no email                                     | Mailpit down, or the SMTP credential was not selected after import         | re-select **LendLoop Mailpit** in the Email nodes                                                     |
| W3 executions sit in `running` when Mailpit is down      | nodemailer's connection wait                                               | bounded by the workflow's `executionTimeout` (60s); restart Mailpit                                   |
| Schedule never fires                                     | workflow not published, or n8n not restarted after publishing              | step 4; check `settings.timezone`                                                                     |
| Duplicate reminder email on a manual re-run              | each manual run sends again; the write-back is deduped                     | expected; the daily schedule uses a new `dayOffset` per day                                           |

Visibility, not guesswork: the loan card shows the automation trail
("Reminder sent 2 days ago"), and the admin panel shows queued/failed outbox rows
plus the most recent events.

## Reliability rules

- **Outbox:** mutations enqueue, a one-minute Convex cron drains. Backoff
  1m → 2m → 5m → 15m → 30m, six attempts, then `failed` + event + one W3 alert.
  A `sending` row carries a 5-minute lease in `nextAttemptAt`; an expired lease is
  released by the next drain, so a crashed action cannot strand it.
- **Inbound retries:** n8n HTTP nodes use `retryOnFail`, `maxTries: 3`,
  `waitBetweenTries: 5000`. The write-back re-sends the same payload and
  idempotency key.
- **Idempotency:** Convex has no unique constraint. Every insert is guarded by a
  read of `by_idempotencyKey` inside the same transaction; a duplicate returns
  success.
- **Ordering:** events are informational; the feed sorts by `createdAt`, so an
  out-of-order delivery cannot corrupt state.
- **Timeouts:** HTTP nodes 10s; W1/W3 `executionTimeout: 60`, W2 300.

## Known limits (honest list)

- Email is **at-least-once**: if W1 sends the email and then fails before
  responding, Convex retries and the recipient may get it twice. The write-back
  direction is exactly-once by idempotency key; the email itself is not.
- W1 does not keep its own dedupe store. The outbox already sends each row once
  except on that failure window.
- The tunnel hostname changes whenever cloudflared restarts; updating
  `N8N_REQUEST_WEBHOOK_URL` is a documented one-liner.
- n8n reports a Postgres 16 compatibility warning. The stack is pinned to
  Postgres 16 for reproducibility; production should use 17+ (`compose.yml`).
