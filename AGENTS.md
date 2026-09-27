# Standing Project Rules

*This file is auto-loaded by coding agents (Claude Code, Cursor, etc.) at the
start of every session in this project. It exists so these rules never have
to be re-pasted into a new chat Ã¢â‚¬â€ the agent reads this file the same way it
reads any other file in the repo.*

---

## Source of Truth

`docs/PRD.md` is the single source of truth for this project. Before doing
any work in a new session, read it in full, along with the current state of
the codebase under `packages/`, to establish what phase the project is
actually at. Do not assume prior chat history exists Ã¢â‚¬â€ it does not persist
across sessions. This file and `docs/PRD.md` are what persist.

## Current Confirmed Stack (see PRD Section 1.1)

MERN (MongoDB, Express, React, Node.js) Ã‚Â· Frontend + Backend API on Vercel Ã‚Â·
Async workers (BullMQ + Redis) on a separate always-on service (not Vercel)
Ã‚Â· MongoDB Atlas + Atlas Vector Search Ã‚Â· AWS S3 + CloudFront for storage/CDN
Ã‚Â· Razorpay for payments.

## Phase Discipline

- Follow the phase order in PRD Section 17. Do not skip ahead (e.g., do not
  build gallery delivery before the upload/processing pipeline exists).
- At the start of a session, state which phase the project is currently on
  and which phase you are about to work on, based on what's actually in the
  repo Ã¢â‚¬â€ not on memory of a previous conversation.

## Documentation Stays in Sync

After ANY meaningful change (new feature, schema change, API endpoint,
security rule, or a resolved Open Decision), update `docs/PRD.md`
accordingly, in the same session as the change:
- Resolved Open Decision Ã¢â€ â€™ update Section 14 and Section 15 (mark it
  Confirmed with its DEC ID).
- Schema/entity change Ã¢â€ â€™ update Section 10 (Data Model).
- New/changed API endpoint Ã¢â€ â€™ update Section 11.
- Never leave `docs/PRD.md` stale Ã¢â‚¬â€ it is what every future session reads
  instead of chat history.

## Requirement Traceability

- Reference requirement IDs (`FR-*`, `NFR-*`, `SEC-*`, `PRIV-*`, `DEC-*`) in
  commit messages and code comments when implementing something tied to one.

## Security & Config Rules (non-negotiable)

- Every endpoint or query touching tenant/event/guest data must enforce
  tenant-scoping server-side (`SEC-001`, `SEC-002`). Reuse existing
  auth/tenant-scoping middleware Ã¢â‚¬â€ do not rewrite it per feature.
- Never hardcode prices, quotas, or retention periods Ã¢â‚¬â€ read from
  Plan/RetentionPolicy config (`NFR-MAINT-001`).
- No duplicate components/services/models; check for existing code before
  adding something new; no unrelated refactoring while implementing a
  specific backlog item.

## Open Decisions & Assumptions

If something in the PRD is marked "Open Decision" or "Assumption" and it
blocks progress, **stop and ask** Ã¢â‚¬â€ do not guess, and do not silently pick a
default without saying so. If you must pick a reasonable default to keep
moving, say explicitly which default you picked and log it in PRD Section 15
so it's visible to the next session.

## Working Efficiently (avoid wasted time/tokens)

- Do not run repeated polling/status-check loops on installs or downloads
  (e.g., checking every couple minutes whether a large binary finished
  downloading). Run the install/download once; if it's a large one-time
  download, say so once and continue with other independent work in
  parallel rather than waiting and re-checking repeatedly.
- Give concise summaries at the end of a phase or task Ã¢â‚¬â€ what changed, what
  tests pass, whether `docs/PRD.md` was updated Ã¢â‚¬â€ not a blow-by-blow of
  every file touched.

## End of Phase Checklist

Before declaring a phase complete, confirm:
1. All FR/NFR/SEC/PRIV items for that phase (per PRD Section 17) are
   implemented.
2. Tests pass.
3. `docs/PRD.md` reflects any changes made during the phase.
4. A short summary is given, and the next phase (per Section 17) is named.


## Known Issues & Fixes Log

### BUG-001: Blank Screen After Login on Production (Vercel) â€” Fixed 2026-09-25

**Symptoms:** Login at https://photofolio-official.vercel.app/login accepts credentials
but redirects to a blank white screen. No error visible to user.

**Root Causes (4 issues):**

1. **CRITICAL â€” `connectDB()` never called in Vercel serverless entry point.**
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
- `api/index.js` â€” added `connectDB()` call
- `packages/server/src/config/db.js` â€” removed `process.exit(1)`, added warm-connection reuse
- `packages/server/src/controllers/auth.controller.js` â€” added `tenant` to login response
- `packages/client/src/components/common/ErrorBoundary.jsx` â€” new file
- `packages/client/src/main.jsx` â€” wrapped App with ErrorBoundary

**Vercel env check (manual):** Ensure `CLIENT_URL=https://photofolio-official.vercel.app`
is set in Vercel dashboard > Settings > Environment Variables.

### BUG-002: Invalid Date on Event Dashboard — Fixed 2026-09-27

**Symptoms:** Event detail page showed "Invalid Date" for START and END fields.

**Root Cause:** `EventDetailPage.jsx` used `event.dateStart` / `event.dateEnd` but the
Event Mongoose model stores dates as nested `event.date.start` / `event.date.end`.
Same mismatch existed in `guest.service.js` `getEventByQrToken()` which returned
`event.dateStart` (undefined).

**Fix:** Changed all frontend and backend references to use `event.date?.start` / `event.date?.end`.

**Files:** `packages/client/src/pages/events/EventDetailPage.jsx`,
`packages/server/src/services/guest.service.js`, `packages/client/src/pages/guest/GuestLandingPage.jsx`

### BUG-003: QR-B Selfie Submit "QR token is required" — Fixed 2026-09-27

**Symptoms:** After uploading selfie on consent page (QR-B flow), clicking
"Submit & Find My Photos" showed error "QR token is required."

**Root Causes (3 issues):**

1. **Frontend sent multipart/form-data** but Express has no multer middleware,
   so `req.body` was empty/undefined → `qrToken` was undefined.
2. **Frontend combined consent + selfie** in one request, but backend requires
   two separate steps: `POST /api/guest/consent` (returns guestToken) then
   `POST /api/guest/selfie` (requires `Authorization: Guest <token>` header).
3. **Frontend sent `consentGiven: 'true'`** but backend expects `consentTextVersion: '1.0'`.

**Fix:** Rewrote `ConsentPage.jsx` to follow correct 2-step JSON flow:
Step 1 (consent form submit) → `POST /api/guest/consent` with `{ qrToken, consentTextVersion }`
Step 2 (selfie submit) → `POST /api/guest/selfie` with `{ imageData (base64), contentType }`
and `Authorization: Guest <token>` header.

**Files:** `packages/client/src/pages/guest/ConsentPage.jsx`
