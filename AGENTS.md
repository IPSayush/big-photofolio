# Standing Project Rules

*This file is auto-loaded by coding agents (Claude Code, Cursor, etc.) at the
start of every session in this project. It exists so these rules never have
to be re-pasted into a new chat ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the agent reads this file the same way it
reads any other file in the repo.*

---

## Source of Truth

`docs/PRD.md` is the single source of truth for this project. Before doing
any work in a new session, read it in full, along with the current state of
the codebase under `packages/`, to establish what phase the project is
actually at. Do not assume prior chat history exists ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it does not persist
across sessions. This file and `docs/PRD.md` are what persist.

## Current Confirmed Stack (see PRD Section 1.1)

MERN (MongoDB, Express, React, Node.js) Ãƒâ€šÃ‚Â· Frontend + Backend API on Vercel Ãƒâ€šÃ‚Â·
Async workers (BullMQ + Redis) on a separate always-on service (not Vercel)
Ãƒâ€šÃ‚Â· MongoDB Atlas + Atlas Vector Search Ãƒâ€šÃ‚Â· AWS S3 + CloudFront for storage/CDN
Ãƒâ€šÃ‚Â· Razorpay for payments.

## Phase Discipline

- Follow the phase order in PRD Section 17. Do not skip ahead (e.g., do not
  build gallery delivery before the upload/processing pipeline exists).
- At the start of a session, state which phase the project is currently on
  and which phase you are about to work on, based on what's actually in the
  repo ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â not on memory of a previous conversation.

## Mongoose Model Safety (Standing Rule)

Every Mongoose model file MUST use the guard pattern:
```js
module.exports = mongoose.models.ModelName || mongoose.model('ModelName', schema);
```
This prevents OverwriteModelError when the same model is required from
multiple paths in the monorepo (e.g., worker loading server models).

NEVER require() from packages/server/ inside packages/worker/ code.
Worker has its own model copies under packages/worker/src/models/.
For models that only exist in server (Guest, ConsentRecord, AuditLog),
use `mongoose.models.ModelName` at runtime.

## Railway Worker Deployment Config

- **Build Command:** EMPTY / no-op (worker is plain Node.js, no compile)
- **Start Command:** `npm run start --workspace=@photofolio/worker`
- **Root Directory:** repo root (not packages/worker)
- **Required env vars:** MONGODB_URI, REDIS_URL, AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_ORIGINALS,
  S3_BUCKET_DERIVATIVES, NODE_ENV, FACE_MATCH_THRESHOLD (optional),
  FACE_PROVIDER (optional, default: mock), WORKER_CONCURRENCY (optional)

## Documentation Stays in Sync

After ANY meaningful change (new feature, schema change, API endpoint,
security rule, or a resolved Open Decision), update `docs/PRD.md`
accordingly, in the same session as the change:
- Resolved Open Decision ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ update Section 14 and Section 15 (mark it
  Confirmed with its DEC ID).
- Schema/entity change ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ update Section 10 (Data Model).
- New/changed API endpoint ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ update Section 11.
- Never leave `docs/PRD.md` stale ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it is what every future session reads
  instead of chat history.

## Requirement Traceability

- Reference requirement IDs (`FR-*`, `NFR-*`, `SEC-*`, `PRIV-*`, `DEC-*`) in
  commit messages and code comments when implementing something tied to one.

## Security & Config Rules (non-negotiable)

- Every endpoint or query touching tenant/event/guest data must enforce
  tenant-scoping server-side (`SEC-001`, `SEC-002`). Reuse existing
  auth/tenant-scoping middleware ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â do not rewrite it per feature.
- Never hardcode prices, quotas, or retention periods ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â read from
  Plan/RetentionPolicy config (`NFR-MAINT-001`).
- No duplicate components/services/models; check for existing code before
  adding something new; no unrelated refactoring while implementing a
  specific backlog item.

## Open Decisions & Assumptions

If something in the PRD is marked "Open Decision" or "Assumption" and it
blocks progress, **stop and ask** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â do not guess, and do not silently pick a
default without saying so. If you must pick a reasonable default to keep
moving, say explicitly which default you picked and log it in PRD Section 15
so it's visible to the next session.

## Working Efficiently (avoid wasted time/tokens)

- Do not run repeated polling/status-check loops on installs or downloads
  (e.g., checking every couple minutes whether a large binary finished
  downloading). Run the install/download once; if it's a large one-time
  download, say so once and continue with other independent work in
  parallel rather than waiting and re-checking repeatedly.
- Give concise summaries at the end of a phase or task ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â what changed, what
  tests pass, whether `docs/PRD.md` was updated ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â not a blow-by-blow of
  every file touched.

## End of Phase Checklist

Before declaring a phase complete, confirm:
1. All FR/NFR/SEC/PRIV items for that phase (per PRD Section 17) are
   implemented.
2. Tests pass.
3. `docs/PRD.md` reflects any changes made during the phase.
4. A short summary is given, and the next phase (per Section 17) is named.


## Known Issues & Fixes Log

### BUG-001: Blank Screen After Login on Production (Vercel) Ã¢â‚¬â€ Fixed 2026-09-25

**Symptoms:** Login at https://photofolio-official.vercel.app/login accepts credentials
but redirects to a blank white screen. No error visible to user.

**Root Causes (4 issues):**

1. **CRITICAL Ã¢â‚¬â€ `connectDB()` never called in Vercel serverless entry point.**
   `api/index.js` exported the Express app without connecting to MongoDB. Every API
   call returned `FUNCTION_INVOCATION_FAILED` (500). Fixed by adding `await connectDB()`
   before delegating to Express.

2. **`db.js` called `process.exit(1)`** on connection failure, killing the serverless
   function instead of returning a proper error. Fixed by throwing an Error instead.

3. **Login response missing `tenant` field.** `POST /api/auth/login` returned
   `{ user, tokens }` but frontend `AuthContext` expected `{ user, tenant, tokens }`
   (matching the register response shape). Fixed by fetching tenant in the login
   controller.

4. **No React Error Boundary.** Any unhandled runtime error caused React to unmount
   the entire tree, resulting in a blank screen with no feedback. Fixed by adding
   `ErrorBoundary` component wrapping `<App />`.

**Files changed:**
- `api/index.js` Ã¢â‚¬â€ added `connectDB()` call
- `packages/server/src/config/db.js` Ã¢â‚¬â€ removed `process.exit(1)`, added warm-connection reuse
- `packages/server/src/controllers/auth.controller.js` Ã¢â‚¬â€ added `tenant` to login response
- `packages/client/src/components/common/ErrorBoundary.jsx` Ã¢â‚¬â€ new file
- `packages/client/src/main.jsx` Ã¢â‚¬â€ wrapped App with ErrorBoundary

**Vercel env check (manual):** Ensure `CLIENT_URL=https://photofolio-official.vercel.app`
is set in Vercel dashboard > Settings > Environment Variables.

### BUG-002: Invalid Date on Event Dashboard â€” Fixed 2026-09-27

**Symptoms:** Event detail page showed "Invalid Date" for START and END fields.

**Root Cause:** `EventDetailPage.jsx` used `event.dateStart` / `event.dateEnd` but the
Event Mongoose model stores dates as nested `event.date.start` / `event.date.end`.
Same mismatch existed in `guest.service.js` `getEventByQrToken()` which returned
`event.dateStart` (undefined).

**Fix:** Changed all frontend and backend references to use `event.date?.start` / `event.date?.end`.

**Files:** `packages/client/src/pages/events/EventDetailPage.jsx`,
`packages/server/src/services/guest.service.js`, `packages/client/src/pages/guest/GuestLandingPage.jsx`

### BUG-003: QR-B Selfie Submit "QR token is required" â€” Fixed 2026-09-27

**Symptoms:** After uploading selfie on consent page (QR-B flow), clicking
"Submit & Find My Photos" showed error "QR token is required."

**Root Causes (3 issues):**

1. **Frontend sent multipart/form-data** but Express has no multer middleware,
   so `req.body` was empty/undefined â†’ `qrToken` was undefined.
2. **Frontend combined consent + selfie** in one request, but backend requires
   two separate steps: `POST /api/guest/consent` (returns guestToken) then
   `POST /api/guest/selfie` (requires `Authorization: Guest <token>` header).
3. **Frontend sent `consentGiven: 'true'`** but backend expects `consentTextVersion: '1.0'`.

**Fix:** Rewrote `ConsentPage.jsx` to follow correct 2-step JSON flow:
Step 1 (consent form submit) â†’ `POST /api/guest/consent` with `{ qrToken, consentTextVersion }`
Step 2 (selfie submit) â†’ `POST /api/guest/selfie` with `{ imageData (base64), contentType }`
and `Authorization: Guest <token>` header.

**Files:** `packages/client/src/pages/guest/ConsentPage.jsx`


### BUG-004: Double /api/ Prefix in Selfie Upload — Fixed 2026-09-27

**Symptoms:** QR-B selfie submit returned "Route POST /api/api/guest/selfie not found."

**Root Cause:** `ConsentPage.jsx` used `api.raw.post('/api/guest/selfie', ...)` but
`api.raw` is the axios instance with `baseURL: '/api'`, so the path doubled to
`/api/api/guest/selfie`.

**Fix:** Changed to `api.raw.post('/guest/selfie', ...)`.

**Audit:** Grepped entire frontend codebase for hardcoded `'/api/'` in API call paths.
This was the **only instance**. All other API calls use `api.get()`, `api.post()` etc.
which use the wrapper methods (no `/api/` prefix needed since baseURL handles it).

**Prevention rule:** When using `api.raw` (the raw axios instance) or `api.get/post`
(the wrapper), NEVER include `/api/` prefix in the path. The baseURL `'/api'` is already
configured. Paths should start with `/guest/...`, `/events/...`, `/auth/...` etc.

**File:** `packages/client/src/pages/guest/ConsentPage.jsx`


### BUG-005: QR-A Token on Consent Page Shows "Invalid QR code" + Emoji Encoding — Fixed 2026-09-28

**Symptoms:** Visiting /guest/consent/<token> with a QR-A token showed the consent form
but displayed "Invalid QR code." after clicking Continue. Also, all emojis on the page
rendered as garbled text (e.g. "ÃÂ°ÃÂÃÂ'" instead of wave emoji).

**Root Causes:**
1. **QR-A token on consent page:** The consent page loaded event info via
   `GET /guest/events/:token` which accepts both QR-A and QR-B tokens. But
   `POST /guest/consent` only accepts QR-B tokens (`Event.findOne({ qrBToken })`).
   So the page loaded fine but consent submission failed.
2. **Emoji encoding:** ConsentPage was written via PowerShell `@'...'@` here-string
   which double-encoded UTF-8 emoji characters.

**Fix:**
1. ConsentPage now checks `data.qrType` on load — if it's 'A', immediately redirects
   to `/guest/events/:token` (the correct gallery landing page for QR-A tokens).
2. Replaced literal emoji chars with `String.fromCodePoint()` calls for cross-platform safety.

**Prevention rule:** When writing JSX files via PowerShell, use Node.js `fs.writeFileSync`
instead of PowerShell `Set-Content` or `[System.IO.File]::WriteAllText` for any file
containing non-ASCII characters (emojis, special symbols). PowerShell's string handling
corrupts multi-byte UTF-8 sequences.

**File:** `packages/client/src/pages/guest/ConsentPage.jsx`


### FEATURE: FR-EVENT-007 — Permanent Event Delete with Async Cascade — Built 2026-09-28

**What was built:**

Backend:
- `DELETE /api/events/:eventId` endpoint (SEC-001 tenant-scoped, SEC-007 audit-logged)
- `eventDelete.service.js`: marks event as 'deleting' + enqueues BullMQ job
- Cascade deletes: Matches, FaceDetections, PhotoDerivatives, Photos,
  ConsentRecords, ReferenceFaces, Guests, then Event itself
- S3 batch delete: `batchDeleteObjects()` and `listObjectsByPrefix()` in s3.js
- Queue timeout wrapper (10s) prevents Vercel 504 — if queue fails, event
  stays marked 'deleting' for retry

Worker:
- `eventDeleteProcessor.js` processes cascade-delete jobs
- `worker/index.js` listens on 'event-delete' queue (concurrency: 1, 10 min lock)

Frontend:
- EventDetailPage: red 'Delete Event' button with strong confirmation modal
  (user must type event name exactly to enable delete)
- 'Deleting...' badge + disabled actions when status is 'deleting'

Shared:
- Added `DELETING` to `EVENT_STATUS` enum in `@photofolio/shared`

**Files:** 10 files (see commit c078526 and 3dbce3a)

**PRD updates:** FR-EVENT-007 added to Section 8.4, DEC-010 added to Section 15

**Test result:** DELETE returns 202, event status confirmed as 'deleting'.
Note: actual cascade deletion requires the BullMQ worker on Railway to be
running. Without the worker, events stay in 'deleting' status indefinitely.


### BUG-006: Railway Worker Build Fails "Cannot find module '/app/src/index.js'" — 2026-09-28

**Symptoms:** Railway deployment of worker (packages/worker) fails at BUILD step:
"Error: Cannot find module '/app/src/index.js'"

**Root Cause:** Railway dashboard has a Custom Build Command set to "node src/index.js"
which Railway tries to run FROM THE REPO ROOT during the build phase. The worker entry
point is at packages/worker/src/index.js, not /src/index.js. The worker is a plain
Node.js process — it needs NO build/compile step at all.

**NOT a code bug:** No railway.json/railway.toml/nixpacks.toml/Procfile exists in the
repo. The misconfigured build command is set ONLY in the Railway dashboard UI.

**Code fix (defensive):** Added no-op "build" script to packages/worker/package.json:
"build": "echo no build step required for worker"

**Dashboard fix (user must do manually):**
1. Railway Dashboard -> Worker Service -> Settings -> "Build" section
2. Find "Custom Build Command" field
3. CLEAR it completely (leave empty) or set to: echo 'no build required'
4. Do NOT touch the Start Command — "npm run start" is correct
5. Redeploy the service

**File:** packages/worker/package.json


### BUG-007: Worker OverwriteModelError Crash-Loop on Railway — Fixed 2026-09-28

**Symptoms:** Worker starts, immediately crashes with:
OverwriteModelError: Cannot overwrite `Event` model once compiled.

**Root Cause:** `eventDeleteProcessor.js` required `packages/server/src/services/
eventDelete.service.js` which loaded `packages/server/src/models/Event.js`.
But the worker's own processors (imageProcessor, faceProcessor) already loaded
`packages/worker/src/models/Event.js`. Two different files at different paths,
both calling `mongoose.model('Event', schema)` -> OverwriteModelError.

**Fix (2 parts):**
1. All 20 Mongoose models (14 server + 6 worker) guarded with:
   `module.exports = mongoose.models.X || mongoose.model('X', schema)`
2. Rewrote `eventDeleteProcessor.js` to be self-contained — uses worker's own
   models instead of reaching into `packages/server/` internals.

**Files:** 21 files changed (all model files + eventDeleteProcessor.js)


### BUG-008: Upload Timeout — Fixed 2026-09-29

**Symptoms:** Photo upload shows "upload failed" but photos actually appear in dashboard.
**Root Cause:** API client 30s timeout too short for large photo S3 uploads.
**Fix:** Timeout increased to 60s (API) + 120s per file (S3 direct).
**Files:** client/src/api/client.js, client/src/pages/events/UploadPage.jsx

### BUG-009: QR-A "Get My Photos" Redirect Loop — Fixed 2026-09-29

**Symptoms:** "Get My Photos" on QR-A landing page doesn't navigate.
**Root Cause:** GuestLandingPage linked to consent page, which detected QR-A and redirected back.
**Fix:** GuestLandingPage now checks qrType: A shows gallery directly, B shows consent link.
**File:** client/src/pages/guest/GuestLandingPage.jsx

### UI-001: Warm Cream Theme + Mobile-First Responsive — Applied 2026-09-29

**What changed:** Complete frontend theme overhaul from dark purple/teal to warm white-cream (#FDFBF7 bg, #C9A96E gold accent). Added mobile bottom nav, persistent header with user dropdown, responsive breakpoints.
**Files:** 10+ CSS/JSX files in packages/client/src/
