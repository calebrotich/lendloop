# Changelog

Release notes for LendLoop. Entries record what changed and what was learned;
keep them short.

One entry per shipped change.

- **2026-11-04** — App scaffold. Next 16.4.5 + React 19.3 + TS 5.9.3 + Tailwind 4 shell, ESLint 9 flat
  config, Prettier, Vitest, `scripts/check-secrets.mjs` (with tests), CI, README stub. Renamed
  `docker-compose.yml` → `compose.yml` (Compose v5 discovery). Corrections found while building:
  Convex has no unique index, so idempotency relies on an index lookup; `npx` is unusable on this
  machine; and both TS 7 and ESLint 10 are blocked by the Next lint plugin ecosystem.
- **2026-11-07** — Auth and schema. Dev deployment `rare-jaguar-861` bound to the Clerk issuer by
  `convex/auth.config.ts`; schema v1 (`users`, `tools`, `loanRequests`, `auditLog`) pushed;
  `users.ensureCurrent` (idempotent; admin only from the token's verified email claim) and
  `users.me`; `requireIdentity`/`requireUser` in `convex/lib/authz.ts`. Clerk 7 + Convex in
  `app/providers.tsx`; Next 16 `proxy.ts` replaces `middleware.ts`; the CTA uses `<Show>` because
  Clerk Core 3 removed `SignedIn`/`SignedOut`. Nine `convex-test` cases cover idempotency, the
  anonymous rejection, and the fact that a client-supplied email cannot self-promote. Env split
  documented in `.env.example`. Automation tables are deferred until the workflows exist, so their
  payload contract is written once.
- **2026-11-07** — Public shelf. `convex/tools.ts#listPublic` is the only anonymous read: available,
  non-removed tools returning exactly `{ name, category }` behind a return validator. The
  public page server-renders it through `ConvexHttpClient` inside `<Suspense>`, with skeleton, empty
  and error states, and Clerk's CTA stays unauthenticated-only. Demo data lives in
  `convex/seed.ts` (`convex run seed:seedDemoShelf`, idempotent, internal-only). Six `convex-test`
  cases assert the projection, the anonymous read, removed/unavailable exclusion, ordering, and that
  a description can never leak. Verified against the served HTML: tool names present, owner name and
  description absent.
- **2026-11-07** — Listings. Listing CRUD is owner-scoped in Convex: `tools.create`, `update`,
  `remove`, `listMine`. `requireOwnedTool` loads the row and compares `ownerId` to the caller, so
  there is no owner argument to forge. Edits are limited to `available`/`unavailable`, and both edit
  and remove refuse a tool that is on loan (CONFLICT) so a loan cannot be orphaned. The form shares
  `LIMITS` and the enum option lists with the server and maps ConvexError codes to copy. My listings
  supports create, edit, pause and a two-step remove, with skeleton and empty states.
  `(app)/layout.tsx` redirects unauthenticated visitors as a UX guard only — fourteen new
  `convex-test` cases cover the CRUD path, including the wrong-user FORBIDDEN and the on-loan
  conflict. Live check: `convex run tools:create` without an identity returns UNAUTHORIZED.
- **2026-11-07** — Requests. The loan lifecycle: `requests.create` validates the window (start ≤ end,
  not past, ≤30 days), refuses your own tool, a paused listing, an overlap with an approved loan and
  an overlapping duplicate pending request. `approve`/`decline` are owner-only, `cancel` is
  borrower-only, `markReturned` accepts either party — and approval re-checks overlap _inside_ the
  transaction, so two owners approving the same days cannot both win. The status model was narrowed
  to stored states (`pending|approved|declined|cancelled|returned`); `upcoming|active|overdue` and
  `available|on_loan|paused` are derived on read, so availability is real rather than aspirational
  — there is no `lent` flag to go stale, and the public shelf hides a tool that is out on loan.
  Browse, My requests and Incoming are routed with skeleton/empty/error states. 33 new tests (14
  date/overlap unit tests, 19 lifecycle) for 70 total.

- **2026-11-07** — Admin. `requireAdmin` reads the role from the `users` row and gates
  `admin.removeListing` (soft delete, blocks a tool that is out on loan), `admin.listAllLoans`,
  `admin.listUsers`, `admin.setTrustedLender`, `admin.listAudit`. Every mutation writes its
  `auditLog` row in the same transaction as the change, so an action cannot happen without a trace.
  Admin is granted only from the server side: `ADMIN_EMAIL_ALLOWLIST` plus the internal
  `admin.promoteFromAllowlist` — there is no client-callable path to a role. The admin panel shows
  all loans, moderates listings, toggles trusted lenders and lists recent admin actions. Nine
  `convex-test` cases, each paired with its FORBIDDEN case, for 79 total.

- **2026-11-07** — Automation. Two spikes first, because both could have invalidated the design:
  (1) n8n 2.46 Code nodes have **no WebCrypto** and `require('crypto')` is blocked unless
  `NODE_FUNCTION_ALLOW_BUILTIN=crypto` is set, and the raw body only exists when the Webhook node's
  **`options.rawBody`** is on — it arrives base64 in `binary.data.data`, not as a string in
  `$json.body`; (2) Convex Cloud reaches a cloudflared quick tunnel, but only when cloudflared is
  started with an explicit empty `--config`, otherwise a local named-tunnel ingress 404s everything.
  Both are written up in `docs/spikes/raw-body-and-tunnel.md`; the first changed
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
- **2026-11-07** — Commit messages rewritten for readers outside the implementation: plan labels,
  internal requirement references and verification transcripts removed. The convention lives in
  [`docs/commit-messages.md`](commit-messages.md).

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
  implementation choice, not a stated product requirement (the rule only scopes edits to the owner).
  The guard was removed from all of them: loans keep their own rows and derived availability, so editing,
  delisting or adding photos while a tool is out cannot orphan a loan or change its dates. The
  now-unused `isToolOutOnLoan` helper was removed. Tests assert the allowed behavior and that the
  loan survives a removal. 165 tests.

- **2026-11-08** — UI pass: the public landing and item pages. The palette from the email
  templates (`#1F299C` / `#16215B` / `#F25929` + supported blues and mists) is now the app-wide
  token set, with Manrope body type and Fraunces standing in for the licensed GT Alpina display
  face. `app/page.tsx` is a full landing: editorial hero, three-part search with a sliding
  `layoutId` focus, category rail, shelf grid, how-it-works, lend CTA. Every card opens
  `/listings/[id]`, a public detail page with a gallery/lightbox, owner summary, derived
  availability, request card and related shelf. A compact floating header appears on scroll;
  buttons use a CSS travel sweep on hover/press; saves, shares and request outcomes toast; every
  image has a shimmer-to-photo transition and category-art fallback; the route has a skeleton and
  branded 404s. Added `tools.listShowcase` and `tools.getPublicListing` (anonymous, bounded,
  name/category/description/first name only — no owner id or email) and tests for the projection,
  privacy, availability and gallery ordering. 170 tests, typecheck and lint green. Design notes and
  the GT Alpina drop-in instructions are in `docs/ui.md`. The dev shelf's two mismatched test
  photos were replaced with licensed Pexels covers and six empty listings were given one; old R2
  objects were retained, and the demo neighbour now reads as "Amina".

- **2026-11-08** — Interaction pass on the item page and listing flow. The request form now uses a
  real range calendar (`react-day-picker`) with two months on desktop and a bottom sheet on
  mobile: From/To are one control with a sliding highlight, selecting a start advances the
  highlight to the return field, and a completed range closes the panel. The detail query now
  returns merged, future `busyRanges` for **pending and approved** requests (never who asked), so
  booked days are visibly struck through and unselectable; ranges cannot cross a booking, past
  dates and >30-day windows are blocked, and a one-day loan is a double-tap on the same day. The
  request card flips the calendar above the fields when there is no room below. Category tabs now
  scroll the results to a position where the selected category rail stays visible (global scroll
  padding replaced the doubled scroll margins), and the chosen tab is centred in the rail. New
  listings are a two-step flow: create details, then the page immediately switches to a focused
  “add photos” step with a large dropzone, cover handling, preview and done actions; listing rows
  with no photo link straight to that step. Added `react-day-picker` and `date-fns`. 171 tests,
  typecheck/lint green.

- **2026-11-08** — Calendar refinement and browse cleanup. The range picker no longer closes when the return date is chosen: From/To stay editable, a footer Done applies the close, Clear resets the range, and after a completed range the next day click starts a new range (clicking To first refines the existing return). Once a start is chosen, days past the 30-day window are disabled with a distinct grey treatment and a “Beyond 30 days” legend entry, while booked days keep the orange strike-through. Hovering a future day previews the range from the chosen start, with a ring on the hovered end, and is suppressed when the preview would cross a booking or the limit. The old `/tools` browse page and its now-unused shelf/gallery components were removed; `/tools` redirects to the public `#shelf`, and the signed-in nav’s Browse link goes there. Docs updated. 171 tests, typecheck/lint/format/build green.

- **2026-11-08** — Hero: the top “neighbourhood shelf / N tools” pill is gone. The hero is now a split editorial composition: a larger left-aligned headline, the three-part search directly beneath it, and a fan of **three real listing cards** on the right. The cards are picked from actual available listings with covers, one per category, preferring established listings; each card shows its real item photo and metadata. A dashed orbit with a slowly travelling orange dot, a gentle independent float on each card, hover-to-front/straighten and a “Borrow · Lend · Return” caption carry the loop idea. Mobile gets a compact stack of three real listing thumbnails above the search plus a swipeable card rail below it. Reduced-motion users get the static fan. The hero screenshots in `docs/ui/` were regenerated.

- **2026-11-08** — Hero highlight cards now act as category shortcuts: clicking a card scrolls to
  the category rail with that category active and filters the shelf, instead of opening the item
  page. The hover arrow points down, and the float pauses under the pointer/focus so the cards are
  easy to click. Added the GitHub repository link (`https://github.com/calebrotich/lendloop`) to
  the footer bottom bar with an external-link target.

- **2026-11-08** — Pricing, incoming signal, request revamp, brand alignment and image
  optimisation. Listings now carry `valueCents` and `dailyRateCents`; the form recommends 3–5% of
  value (4% one-tap) and allows a free listing. Every card, listing detail, request form and date
  picker shows the daily rate and a running booking total, and `loanRequests.dailyRateCents`
  snapshots the agreed rate so later edits cannot rewrite a booking. `requests.listMine` /
  `listIncoming` now return the cover summary, trust flags, day count and total; `incomingSummary`
  drives a bell badge, a strip on arrival and the nav count. My requests and Incoming share a new
  board with stats, filters, search, cover-led cards, a collapsed notification trail and admin
  shortcuts. The product uses the email lockup (indigo tile + orange return + navy wordmark) in the
  header, footer, favicon and brand exports. Listing photos run through `next/image` with an R2
  allow-list and AVIF/WebP. Added `migrations:backfillPricing` for listings created before pricing.
  178 tests, typecheck/lint/format/build green.

- **2026-11-08** — Pricing in USD, and the replacement value is now an explicit reimbursement term
  rather than just a rate input. The listing form asks for a replacement value and daily rate in USD,
  recommends 3–5% (4% one-tap), and explains that the value is what a borrower reimburses if the
  item is lost or not returned. `loanRequests.valueCents` snapshots the value at booking alongside
  the rate; the listing detail, request card, request form and notification emails all show the
  commitment. The public detail query exposes the value (the shelf still does not), and the email
  template adds a “Replacement value” fact plus a reimbursement sentence on approval. The demo
  shelf and loan snapshots were rescaled from the old demo currency to USD; the empty-database
  backfill now uses USD category values. 178 tests, typecheck/lint/format/build green.

- **2026-11-09** — Confirmation, celebration and inbox recency. Every consequential request action
  (approve, decline, withdraw, mark returned) and listing removal now goes through a shared native
  `<dialog>` alert (`components/ui/alert-dialog.tsx`) with the tool, dates and neighbour named,
  focus parked on the safe choice, and a locked state while the mutation is in flight. Sending a
  request and creating a listing get a one-shot `SuccessBurst` — drawn check, ring and sparks, with
  a static reduced-motion fallback — instead of relying on a toast alone. Both request inboxes now
  sort by the latest activity: `loanRequests.updatedAt` is stamped on create and every decision,
  and old rows fall back to their decision/return/create timestamps. 180 tests, typecheck/lint
  green.

- **2026-11-09** — Listings no longer name the owner. `tools.listShowcase` and
  `tools.getPublicListing` drop `ownerName` (and the first-name helper) and keep only
  `ownerTrusted`; the shelf card, hero card and detail page now show “Trusted lender” for trusted
  owners and a neutral neighbour line otherwise, and the request card's copy no longer interpolates
  a name. Admin's authenticated browse still carries the owner name for moderation. 180 tests,
  typecheck/lint/format green.

- **2026-11-09** — Owners can see their own listings the way a borrower does. My listings links
  each row's title to `/listings/[id]` and adds a "View public page" action in a new tab.
  `tools.getPublicListing` now returns a viewer-relative `isOwner` boolean (resolved from the
  caller's users row, never `ownerId`); the detail page's request card and mobile bar switch to an
  owner state with a link to `/incoming-requests` instead of the request form. 181 tests,
  typecheck/lint/format green.
- **2026-11-09** — The hero gets a pointer-following loop. A canvas behind the hero content
  (`components/landing/hero-cursor-loop.tsx`) follows a fine pointer with a soft halo, two
  counter-phased trails on the hero's tilted ellipse, a dashed outer orbit and sparks emitted on
  movement. It fades at the hero edge, pauses when off screen or hidden, and is disabled for
  reduced motion and coarse pointers. Typecheck/lint/format green.

- **2026-11-09** — Documentation refreshed for the portfolio release. README now maps the project,
  links a public production note, and records live Zoho email from `lendloop@bahasha.app`; stale
  Mailpit-only, Playwright and unverified-delivery claims are gone. 191 tests.
