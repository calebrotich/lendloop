# n8n automation

Three committed workflows live in `automation/workflows/`. Convex owns the state, authorization and
email rendering; n8n owns transport and scheduling. The executable contract is
`convex/lib/n8n.ts`.

| Workflow                      | Trigger                                                                | Does                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **W1 · request-notification** | Webhook `POST /webhook/lendloop-request`                               | Verifies HMAC, emails the owner or borrower for a loan event                                                        |
| **W2 · overdue-reminders**    | Daily 09:00 `Africa/Nairobi`, plus a manual trigger for demos          | Fetches overdue loans, emails each borrower, writes the reminder back, posts a run summary                          |
| **W3 · error-handler**        | n8n Error Trigger **and** webhook `POST /webhook/lendloop-error-alert` | Records workflow errors in Convex and emails `LENDLOOP_OPS_EMAIL`; also receives Convex's permanent-delivery alerts |

When a notification exhausts six attempts, Convex records `automation.failed` and queues one signed
alert to W3. Alert rows never spawn further alerts.

## Signing

```text
X-LendLoop-Timestamp: 1763000000
X-LendLoop-Signature: v1=<64 hex chars>
X-LendLoop-Idempotency-Key: request:<id>:approved
```

- `X-LendLoop-Signature` is `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`.
- The shared secret is `N8N_HMAC_SECRET`. Convex reads it from its deployment env; n8n reads it as
  `$env.LENDLOOP_HMAC_SECRET`. Compose maps `.env` into the container.
- A timestamp more than `SIGNATURE_TOLERANCE_SECONDS` (default 300) away from the receiver's clock
  is rejected, in either direction. Digests are compared in constant time.
- Verification happens **before** parsing or any side effect: W1/W3 before email, Convex before any
  database write.
- n8n's Code node has no WebCrypto. `compose.yml` allows Node's `crypto` module only, via
  `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.
- The webhook's raw body is base64 in `binary.data.data`. `$json.body` is the parsed object and must
  never be re-serialised to verify the signature.

## Endpoints

| Direction      | Endpoint                                       | Payload                                                                                                                           |
| -------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Convex → W1    | `POST {N8N_REQUEST_WEBHOOK_URL}`               | `{ event, idempotencyKey, occurredAt, recipient{name,email}, tool{name}, window{start,end}, deepLink, email{subject,html,text} }` |
| W2 → Convex    | `POST {CONVEX_SITE_URL}/n8n/overdue-loans`     | `{ asOf? }`; returns approved overdue loans with borrower, dates, `daysOverdue`, deep link and a rendered `email`                 |
| W2 → Convex    | `POST {CONVEX_SITE_URL}/n8n/reminders`         | `{ loanRequestId, dayOffset, dueDate, channel: "email", status: "sent", sentAt }`; Convex derives the idempotency key             |
| W2/W3 → Convex | `POST {CONVEX_SITE_URL}/n8n/automation-events` | `{ kind: "workflow.error" \| "workflow.summary", workflow, executionId, occurredAt, message?, counts? }`                          |

`event` is `request.created`, `request.approved`, `request.declined`, `request.cancelled` or
`request.returned`. Created/returned go to the owner; decisions go to the borrower.

`email` is the finished message, rendered by Convex in `convex/lib/emailTemplates.ts` and
transported verbatim. n8n never re-renders the body, and every Email node disables n8n attribution.
The payload is minimized to one recipient address, the tool name, the dates and a deep link — no
descriptions, third-party addresses or internal IDs.

Status codes: `200` accepted (possibly deduped), `400` valid signature but invalid JSON/shape,
`401` missing/bad signature or stale timestamp, `503` Convex has no `N8N_HMAC_SECRET`.

## Local setup

Prereqs: `docker compose up -d`, `pnpm exec convex dev`, and `.env` filled with `N8N_HMAC_SECRET`,
`POSTGRES_PASSWORD`, `N8N_ENCRYPTION_KEY`, `CONVEX_SITE_URL` and `APP_BASE_URL`.

1. **Tunnel** — Convex Cloud cannot reach `localhost`:

   ```bash
   printf '{}' > /tmp/cloudflared-empty.yml
   cloudflared tunnel --config /tmp/cloudflared-empty.yml --url http://localhost:5678
   ```

   The explicit `--config` matters: a machine with `~/.cloudflared/config.yml` otherwise merges its
   ingress and every quick-tunnel request 404s. Use the printed `https://<name>.trycloudflare.com`.

2. **Convex deployment env** — functions cannot read `.env`:

   ```bash
   pnpm exec convex env set N8N_HMAC_SECRET "$(sed -n 's/^N8N_HMAC_SECRET=//p' .env)"
   pnpm exec convex env set N8N_REQUEST_WEBHOOK_URL 'https://<tunnel>/webhook/lendloop-request'
   pnpm exec convex env set N8N_ERROR_WEBHOOK_URL   'https://<tunnel>/webhook/lendloop-error-alert'
   pnpm exec convex env set APP_BASE_URL 'http://localhost:3000'
   pnpm exec convex env set SIGNATURE_TOLERANCE_SECONDS '300'
   ```

3. **SMTP credential** — in n8n, create an SMTP credential named **LendLoop Mailpit**: host
   `mailpit`, port `1025`, SSL/TLS off, STARTTLS disabled, empty user/password. The committed JSON
   references the stable id `lendloop-mailpit`; on production the same id is named **LendLoop Zoho
   SMTP** with the Zoho host and app password.

4. **Import and publish**:

   ```bash
   docker cp automation/workflows/. lendloop-n8n:/tmp/workflows/
   docker compose exec n8n n8n import:workflow --input=/tmp/workflows/request-notification.json
   docker compose exec n8n n8n import:workflow --input=/tmp/workflows/overdue-reminders.json
   docker compose exec n8n n8n import:workflow --input=/tmp/workflows/error-handler.json
   docker compose exec n8n n8n publish:workflow --id=lendloop-request-notification
   docker compose exec n8n n8n publish:workflow --id=lendloop-overdue-reminders
   docker compose exec n8n n8n publish:workflow --id=lendloop-error-handler
   docker compose restart n8n
   ```

   Every id is stable, and W1/W2 already point at `settings.errorWorkflow =
"lendloop-error-handler"`.

5. **Prove it**:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5678/webhook/lendloop-request
   # 401 — unsigned requests are rejected before any side effect

   docker compose run --rm --no-deps --entrypoint n8n n8n execute --id=lendloop-overdue-reminders
   open http://localhost:8025      # the reminder email, in Mailpit
   ```

## Production

Production runs the same workflows on self-hosted n8n, with Zoho SMTP sending from the
project's verified domain to real recipients. Set `LENDLOOP_OPS_EMAIL` to the operator address
configured for that deployment. Local Mailpit is a development sink only.

Set the production webhook URLs and `APP_BASE_URL` on the Convex deployment. The production shape
and hardening plan are in [`docs/production.md`](production.md).

## Failure playbook

| Symptom                                                  | Likely cause                                                               | Action                                                                                                          |
| -------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Every quick-tunnel URL returns 404, including `/healthz` | `~/.cloudflared/config.yml` ingress is being merged                        | restart cloudflared with `--config` pointing at an empty file                                                   |
| W1 returns 401 for Convex's calls                        | the secrets differ between `.env`, the Convex deployment and the container | compare `docker compose exec n8n printenv LENDLOOP_HMAC_SECRET` with `pnpm exec convex env get N8N_HMAC_SECRET` |
| Outbox `lastError: HTTP 404`                             | stale tunnel hostname, or the workflow is not published                    | re-run step 1, re-set `N8N_REQUEST_WEBHOOK_URL`, publish W1                                                     |
| Outbox `lastError: missing webhook URL`                  | `N8N_REQUEST_WEBHOOK_URL` unset on the deployment                          | step 2                                                                                                          |
| Outbox stuck `pending`, attempts climbing                | n8n is down or unreachable                                                 | `docker compose ps`; backoff is 1m→2m→5m→15m→30m, then failed + W3 alert                                        |
| W2 runs but no email                                     | Mailpit down, or the SMTP credential was not selected after import         | restart Mailpit; re-select the SMTP credential in the Email nodes                                               |
| Schedule never fires                                     | workflow not published, or n8n not restarted after publishing              | step 4; check `settings.timezone`                                                                               |

The loan card shows the automation trail ("Reminder sent 2 days ago"); the admin panel shows
queued/failed outbox rows and recent events.

## Reliability and limits

- **Outbox:** mutations enqueue; a one-minute cron drains. Backoff is 1m → 2m → 5m → 15m → 30m,
  six attempts, then `failed` + event + one W3 alert. A 5-minute lease protects a `sending` row.
- **Idempotency:** Convex has no unique constraint. Each insert is guarded by a read of
  `by_idempotencyKey` in the same transaction; a duplicate returns success.
- **Retries:** n8n HTTP nodes retry three times, five seconds apart. The write-back reuses the same
  payload and idempotency key.
- **Email is at-least-once:** if W1 sends and then fails before responding, the retry may deliver a
  duplicate. Write-backs are exactly-once by idempotency key.
- The local tunnel hostname changes on restart; update `N8N_REQUEST_WEBHOOK_URL` when it does.
- Local Postgres is 16 for reproducibility (n8n warns); production uses Postgres 17.
