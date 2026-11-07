# Stage 5 spikes — raw body & tunnel

Two assumptions could have invalidated the whole automation design, so they were
tested against the real n8n 2.46.4 container before any product code was written.
Both are now settled; this file records the evidence so the next person does not
have to rediscover it.

Environment: n8n `2.46.4` in the repo's `compose.yml` stack, Convex dev deployment
`rare-jaguar-861` (Convex Cloud), cloudflared `2025.2.1`, macOS.

## 1. Raw body + HMAC inside an n8n Code node

**Question.** Can a Webhook-triggered workflow get the _exact_ request bytes, and
can a Code node compute `HMAC-SHA256(secret, \`${timestamp}.${rawBody}\`)` to match
the Convex signer?

**Method.** A throwaway workflow (`spike-raw-body`) with
`Webhook (POST, rawBody) → Code (probe) → Respond`. The probe reported the shape
of the webhook item, environment access, available crypto APIs, and the HMAC it
computed from the headers. A Node client sent a signed request to
`/webhook/spike-raw-body`; the probe compared its digest with the header.

**What the probe showed.**

| Probe field                                                   | Result                                 | Consequence                                                                 |
| ------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `$json.body`                                                  | parsed object                          | Do **not** re-serialise JSON to verify a signature                          |
| `$json.binary.data.data`                                      | base64 string                          | This is the exact raw body                                                  |
| `Buffer` in Code node                                         | available                              | `Buffer.from(b64, "base64").toString("utf8")` is byte-exact                 |
| `typeof $env`                                                 | `object`                               | `$env.LENDLOOP_HMAC_SECRET` works with `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` |
| `globalThis.crypto`                                           | `undefined`                            | WebCrypto/HMAC is **not** available in the Code node                        |
| `require("crypto")`                                           | throws `Module 'crypto' is disallowed` | Needs an allow-list                                                         |
| `require("crypto")` with `NODE_FUNCTION_ALLOW_BUILTIN=crypto` | works                                  | The one compose change this spike produced                                  |
| HMAC vs `X-LendLoop-Signature`                                | `matchesHeader: true`                  | Signing format is confirmed                                                 |

The `rawBody` parameter must be set at the node level (`rawBody: true`); without
it the `binary` field is absent. With it, `$json.body` is still the parsed object,
so the binary field is the only safe source for signature verification.

**Change made because of this spike:** `compose.yml` now sets
`NODE_FUNCTION_ALLOW_BUILTIN: crypto` (exactly one module, never `*`). This is also
a production note: the Code node sandbox has no WebCrypto, so any HMAC workflow
depends on that allow-list.

## 2. Convex Cloud → local n8n through a quick tunnel

**Question.** Convex Cloud runs functions on the public internet; n8n listens on
`127.0.0.1:5678`. Can `cloudflared tunnel --url` bridge that, and does the
tunnel preserve headers and body for HMAC?

**Method.** `cloudflared tunnel --url http://localhost:5678`, then a temporary
internal Convex action (`spike:pingTunnel`, since deleted) that POSTed a signed
JSON body to `https://<tunnel>.trycloudflare.com/webhook/spike-raw-body`. The
action returned n8n's response.

**Result.** `status: 200`, `ok: true`, and the n8n-side probe again reported
`matchesHeader: true` with `rawLength: 23`. Convex Cloud can reach the tunnel, and
the tunnel forwards `x-lendloop-*` headers and the body untouched.

**Gotcha that cost the first attempt.** This machine already has
`~/.cloudflared/config.yml` for an unrelated named tunnel, whose final ingress
rule is `http_status: 404`. `cloudflared tunnel --url …` merged that config, so the
quick-tunnel hostname matched no ingress rule and every request returned 404 —
including `/healthz`. The fix is to pass an explicit empty config:

```bash
cloudflared tunnel --config /tmp/empty.yml --url http://localhost:5678
```

This is a local-environment quirk, not an n8n one, but it will bite anyone who
uses cloudflared for more than one project. `docs/n8n.md` documents it.

## Consequences for the build

1. HMAC verification happens on `binary.data.data` (base64 → UTF-8), never on
   `$json.body`.
2. `NODE_FUNCTION_ALLOW_BUILTIN=crypto` is required and is set in `compose.yml`.
3. `N8N_REQUEST_WEBHOOK_URL` is a single env switch: a tunnel URL in development,
   any public n8n URL in production.
4. The tunnel hostname changes when cloudflared restarts, so
   `pnpm exec convex env set N8N_REQUEST_WEBHOOK_URL …` is a documented one-liner
   (risk 6 in the build map).
