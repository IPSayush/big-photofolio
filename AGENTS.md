# Standing Project Rules

*This file is auto-loaded by coding agents (Claude Code, Cursor, etc.) at the
start of every session in this project. It exists so these rules never have
to be re-pasted into a new chat — the agent reads this file the same way it
reads any other file in the repo.*

---

## Source of Truth

`docs/PRD.md` is the single source of truth for this project. Before doing
any work in a new session, read it in full, along with the current state of
the codebase under `packages/`, to establish what phase the project is
actually at. Do not assume prior chat history exists — it does not persist
across sessions. This file and `docs/PRD.md` are what persist.

## Current Confirmed Stack (see PRD Section 1.1)

MERN (MongoDB, Express, React, Node.js) · Frontend + Backend API on Vercel ·
Async workers (BullMQ + Redis) on a separate always-on service (not Vercel)
· MongoDB Atlas + Atlas Vector Search · AWS S3 + CloudFront for storage/CDN
· Razorpay for payments.

## Phase Discipline

- Follow the phase order in PRD Section 17. Do not skip ahead (e.g., do not
  build gallery delivery before the upload/processing pipeline exists).
- At the start of a session, state which phase the project is currently on
  and which phase you are about to work on, based on what's actually in the
  repo — not on memory of a previous conversation.

## Documentation Stays in Sync

After ANY meaningful change (new feature, schema change, API endpoint,
security rule, or a resolved Open Decision), update `docs/PRD.md`
accordingly, in the same session as the change:
- Resolved Open Decision → update Section 14 and Section 15 (mark it
  Confirmed with its DEC ID).
- Schema/entity change → update Section 10 (Data Model).
- New/changed API endpoint → update Section 11.
- Never leave `docs/PRD.md` stale — it is what every future session reads
  instead of chat history.

## Requirement Traceability

- Reference requirement IDs (`FR-*`, `NFR-*`, `SEC-*`, `PRIV-*`, `DEC-*`) in
  commit messages and code comments when implementing something tied to one.

## Security & Config Rules (non-negotiable)

- Every endpoint or query touching tenant/event/guest data must enforce
  tenant-scoping server-side (`SEC-001`, `SEC-002`). Reuse existing
  auth/tenant-scoping middleware — do not rewrite it per feature.
- Never hardcode prices, quotas, or retention periods — read from
  Plan/RetentionPolicy config (`NFR-MAINT-001`).
- No duplicate components/services/models; check for existing code before
  adding something new; no unrelated refactoring while implementing a
  specific backlog item.

## Open Decisions & Assumptions

If something in the PRD is marked "Open Decision" or "Assumption" and it
blocks progress, **stop and ask** — do not guess, and do not silently pick a
default without saying so. If you must pick a reasonable default to keep
moving, say explicitly which default you picked and log it in PRD Section 15
so it's visible to the next session.

## Working Efficiently (avoid wasted time/tokens)

- Do not run repeated polling/status-check loops on installs or downloads
  (e.g., checking every couple minutes whether a large binary finished
  downloading). Run the install/download once; if it's a large one-time
  download, say so once and continue with other independent work in
  parallel rather than waiting and re-checking repeatedly.
- Give concise summaries at the end of a phase or task — what changed, what
  tests pass, whether `docs/PRD.md` was updated — not a blow-by-blow of
  every file touched.

## End of Phase Checklist

Before declaring a phase complete, confirm:
1. All FR/NFR/SEC/PRIV items for that phase (per PRD Section 17) are
   implemented.
2. Tests pass.
3. `docs/PRD.md` reflects any changes made during the phase.
4. A short summary is given, and the next phase (per Section 17) is named.
