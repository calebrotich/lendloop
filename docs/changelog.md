# Changelog

Stage log for LendLoop. This lives outside the local build map on purpose: that
document is injected into every agent turn, and an append-only history pushed it
past the 64 KiB instruction budget, which silently truncated the build map.

Append one entry per merged stage. Keep entries short — what changed, what was
learned, and anything that contradicts the plan.

- **2026-11-13** — Initial file: briefs distilled into T*/J* IDs, stack proposed, architecture,
  data model, RBAC matrix, security design, n8n contract, traceability, stages.
- **2026-11-13** — Stage 0 (partial): `.gitignore`, `.env.example`, `docker-compose.yml` added;
  stack booted and verified. n8n is **v2.46.4** — workflow JSON and node names must target v2
  (export from this instance, do not hand-write 1.x JSON). Image pinned to `2.46.4`.
- **2026-11-04** — Stage 0a. Next 16.4.5 + React 19.3 + TS 5.9.3 + Tailwind 4 shell, ESLint 9 flat
  config, Prettier, Vitest, `scripts/check-secrets.mjs` (with tests), CI, README stub. Renamed
  `docker-compose.yml` → `compose.yml` (Compose v5 discovery). Corrections found while building:
  Convex has no unique index (idempotency wording fixed in §3/§6/§9), `npx` is unusable on this
  machine (§13.1), and both TS 7 and ESLint 10 are blocked by the Next lint plugin ecosystem
  (§4, §18).
- **2026-11-07** — Stage 0b. Dev deployment `rare-jaguar-861` bound to the Clerk issuer by
  `convex/auth.config.ts`; schema v1 (`users`, `tools`, `loanRequests`, `auditLog`) pushed;
  `users.ensureCurrent` (idempotent; admin only from the token's verified email claim) and
  `users.me`; `requireIdentity`/`requireUser` in `convex/lib/authz.ts`. Clerk 7 + Convex in
  `app/providers.tsx`; Next 16 `proxy.ts` replaces `middleware.ts`; the CTA uses `<Show>` because
  Clerk Core 3 removed `SignedIn`/`SignedOut`. Nine `convex-test` cases cover idempotency, the
  anonymous rejection, and the fact that a client-supplied email cannot self-promote. Env split
  documented (§13.2). Automation tables are deferred to Stage 5 so their payload contract is
  written once, with the workflows.
- **2026-11-07** — Stage 1. `convex/tools.ts#listPublic` is the only anonymous read: available,
  non-removed tools returning exactly `{ name, category }` behind a return validator (T3). The
  public page server-renders it through `ConvexHttpClient` inside `<Suspense>`, with skeleton, empty
  and error states, and Clerk's CTA stays unauthenticated-only (T4). Demo data lives in
  `convex/seed.ts` (`convex run seed:seedDemoShelf`, idempotent, internal-only). Six `convex-test`
  cases assert the projection, the anonymous read, removed/unavailable exclusion, ordering, and that
  a description can never leak. Verified against the served HTML: tool names present, owner name and
  description absent.
- **2026-11-07** — Stage 2. Listing CRUD is owner-scoped in Convex: `tools.create`, `update`,
  `remove`, `listMine`. `requireOwnedTool` loads the row and compares `ownerId` to the caller, so
  there is no owner argument to forge. Edits are limited to `available`/`unavailable`, and both edit
  and remove refuse a tool that is on loan (CONFLICT) so a loan cannot be orphaned. The form shares
  `LIMITS` and the enum option lists with the server and maps ConvexError codes to copy. My listings
  supports create, edit, pause and a two-step remove, with skeleton and empty states.
  `(app)/layout.tsx` redirects unauthenticated visitors as a UX guard only — fourteen new
  `convex-test` cases cover the CRUD path, including the wrong-user FORBIDDEN and the on-loan
  conflict. Live check: `convex run tools:create` without an identity returns UNAUTHORIZED.
- **2026-11-07** — Stage 3. The loan lifecycle: `requests.create` validates the window (start ≤ end,
  not past, ≤30 days), refuses your own tool, a paused listing, an overlap with an approved loan and
  an overlapping duplicate pending request. `approve`/`decline` are owner-only, `cancel` is
  borrower-only, `markReturned` accepts either party — and approval re-checks overlap _inside_ the
  transaction, so two owners approving the same days cannot both win. The status model was narrowed
  to stored states (`pending|approved|declined|cancelled|returned`); `upcoming|active|overdue` and
  `available|on_loan|paused` are derived on read, which is what makes T9 true rather than aspirational
  — there is no `lent` flag to go stale, and the public shelf now hides a tool that is out on loan.
  Browse, My requests and Incoming are routed with skeleton/empty/error states. 33 new tests (14
  date/overlap unit tests, 19 lifecycle) for 70 total.

- **2026-11-07** — Stage 4. `requireAdmin` reads the role from the `users` row and gates
  `admin.removeListing` (soft delete, blocks a tool that is out on loan), `admin.listAllLoans`,
  `admin.listUsers`, `admin.setTrustedLender`, `admin.listAudit`. Every mutation writes its
  `auditLog` row in the same transaction as the change, so an action cannot happen without a trace.
  Admin is granted only from the server side: `ADMIN_EMAIL_ALLOWLIST` plus the internal
  `admin.promoteFromAllowlist` — there is no client-callable path to a role. The admin panel shows
  all loans, moderates listings, toggles trusted lenders and lists recent admin actions. Nine
  `convex-test` cases, each paired with its FORBIDDEN case, for 79 total.

- **2026-11-07** — Stage 5. Two spikes first, because both could have invalidated the design:
  (1) n8n 2.46 Code nodes have **no WebCrypto** and `require('crypto')` is blocked unless
  `NODE_FUNCTION_ALLOW_BUILTIN=crypto` is set, and the raw body only exists when the Webhook node's
  **`options.rawBody`** is on — it arrives base64 in `binary.data.data`, not as a string in
  `$json.body`; (2) Convex Cloud reaches a cloudflared quick tunnel, but only when cloudflared is
  started with an explicit empty `--config`, otherwise a local named-tunnel ingress 404s everything.
  Both are written up in `docs/spikes/stage-5-raw-body-and-tunnel.md`; the first changed
  `compose.yml`, the second changed the README/n8n runbook.
  Built on that: `convex/lib/hmac.ts` (versioned `v1=` header, 300s window, timing-safe compare, Web
  Crypto), an `automationOutbox` + `automationEvents` pair, a one-minute drain with 1m→30m backoff,
  six attempts and a lease on `sending` rows, and three HMAC-verified endpoints. `requests.*` now
  enqueue in the same transaction as the status change; `cancel` gained a notification, and a new
  request notifies the **owner** (the person who must act) rather than the borrower. W1 (raw body →
  verify → compose → SMTP), W2 (schedule + manual trigger → fetch → email → idempotent write-back →
  summary) and W3 (Error Trigger **and** a signed Convex-alert webhook) are imported, published and
  exported with stable ids, so `settings.errorWorkflow` survives re-import. A loan card shows its
  automation trail ("Reminder sent 2 days ago"), and admins get a queued/failed health panel.
  Verified live against Mailpit: W1 200 + email, unsigned 401, W2 reminder + write-back + summary,
  forced SMTP failure → W3 recorded `workflow.error`, and a real outbox drain through the tunnel
  (which also proved `crypto.subtle` works in the Convex runtime). 38 new tests (12 HMAC, 18
  automation, 8 workflow-contract) for 117 total. Known limits recorded in `docs/n8n.md`: outbound
  email is at-least-once, and the tunnel hostname changes on restart.
- **2026-11-07** — Commit messages rewritten for readers outside the build: stage labels, requirement
  IDs and verification transcripts removed. The convention now lives in
  [`docs/commit-messages.md`](commit-messages.md); requirement IDs stay in the local build map §10
  and pull request notes.

- **2026-11-07** — Observability. Sentry 11 runs in all three Next runtimes through
  `instrumentation.ts`, `instrumentation-client.ts` and `app/global-error.tsx`. The wizard's defaults
  were not privacy-neutral: `dataCollection` collects user fields, cookies, headers, query strings
  and request bodies unless each is disabled, so `sentry.options.ts` now turns all of them off and
  Replay masks text, inputs and media. The shared module keeps only `NEXT_PUBLIC_*`/`NODE_ENV`
  reads so the browser bundle never touches server-only env; `SENTRY_DSN` is a public key with an
  env override. The `/monitoring` tunnel route is excluded from the Clerk proxy matcher (it needs
  Sentry's `o`/`p`/`r` query params to rewrite). Delivery was verified with a temporary throwing
  route and a debug build: the SDK captured the event, flushed it and logged no transport error,
  and the tunnel reached Sentry's ingest. Added a `sntrys_` token rule to the secret scanner. 118
  tests.

- **2026-11-07** — Listing media. Photos are first-class: up to six per listing, a cover in the
  public shelf and Browse cards, and a native-dialog gallery. Bytes live in Cloudflare R2 behind
  hand-rolled SigV4 (`convex/lib/r2.ts`, no AWS SDK, Web Crypto only) with presigned PUTs and a
  same-origin Next proxy (`app/api/media/upload/route.ts`). The bucket had no CORS rule and the S3
  key cannot manage bucket config, so the proxy is deliberate: no public CORS, credentials stay on
  the Convex deployment, and the 4 MB cap is checked before storage. Uploads are two-phase
  (`toolImageUploads` ticket → `completeUpload` HEAD + magic bytes → `toolImages` row); the browser
  resizes to 2048 px and re-encodes to strip EXIF/GPS before uploading. Deletes and abandoned
  uploads go through a `storageDeletes` outbox drained every 15 minutes with backoff. Verified
  live on dev with `convex run media:verifyStorage` and the opt-in R2 integration test. 150 tests
  green + 1 skipped live test. Docs: `docs/media-storage.md`.

- **2026-11-07** — Media upload UX fix. Selecting a file now renders a local preview immediately,
  before decoding or network work. The per-upload key no longer calls `crypto.randomUUID`
  unconditionally: on a plain-HTTP origin or an older browser it threw before the progress tile
  existed, so selecting a photo appeared to do nothing and no upload ticket was ever created. The
  upload flow now falls back to `getRandomValues`/`Math.random`, surfaces unexpected failures in the
  section alert, times out a stuck image decode after 30 seconds, and accepts HEIC/HEIF sources where
  the browser can decode them (with an `<img>`-element fallback when `createImageBitmap` cannot).
  Fixed duplicate React keys on the editor and photo-manager siblings. Added tests for the upload
  proxy (forwarding, auth, size, conflict mapping) and the bounded body reader. 162 tests.

- **2026-11-07** — Cross-browser upload fix. Chromium and Safari empty the live `FileList` when
  the file input's `value` is reset; the uploader converted that list _after_ clearing it, so the
  selection silently produced zero files and nothing happened. Firefox keeps the reference
  populated, which is why uploads only worked there (the Convex logs show successful Firefox
  tickets and confirmations but no request at all from Chromium/Safari attempts). The selection
  is now snapshotted before the reset, with a regression test. 164 tests.

- **2026-11-07** — Owner edits are no longer blocked by an active loan. The earlier `CONFLICT`
  guards in `tools.update`, `tools.remove`, photo-ticket creation and admin removal were an
  implementation choice, not a requirement in the brief (T16 only scopes edits to the owner). The
  guard was removed from all of them: loans keep their own rows and derived availability, so editing,
  delisting or adding photos while a tool is out cannot orphan a loan or change its dates. The
  now-unused `isToolOutOnLoan` helper was removed. Tests assert the allowed behavior and that the
  loan survives a removal. 165 tests.
