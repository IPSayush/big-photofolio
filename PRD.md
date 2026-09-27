# Product Requirements Document
## AI-Powered Event Photography Platform (Multi-Tenant SaaS)

---

## 1. Document Control

| Field | Value |
|---|---|
| PRD Title | AI Event Photography Platform — Product Requirements Document |
| Product Name (placeholder) | *[Product Name TBD]* |
| Document Version | v0.1 (Draft) |
| Status | Draft — Pending Stakeholder Review |
| Owner | *[Product Owner Name TBD]* |
| Intended Audience | Product Manager, Founder, UX/UI Designer, Frontend Developer, Backend Developer, Database Developer, AI/ML Developer, Cloud/DevOps Engineer, QA/Test Engineer, Security/Privacy Reviewer, Coding Agents (Claude Code, Cursor, etc.) |
| Last Updated | *[Date Placeholder]* |

**Scope:** This PRD defines product, functional, non-functional, data, security, privacy, and operational requirements for an MVP and near-term roadmap of a multi-tenant SaaS platform that lets photographers deliver AI-personalized event galleries to guests via face-matching.

**Source-of-Truth Statement:** The original prompt supplied by the product owner is authoritative for explicit decisions. Where the prompt is silent, ambiguous, or incomplete, this PRD adds **Recommended Requirements**, **Recommended Decisions**, **Open Decisions**, **Assumptions**, and **Future Considerations**, each explicitly labeled. Nothing in these additions overrides an explicit instruction from the source prompt; conflicts are resolved in favor of the most specific/most recent explicit instruction, and the resolution is logged in Section 15 (Assumptions & Decisions Log).

**Requirement ID Conventions:**
- `FR-<Module>-###` — Functional Requirement
- `NFR-<Category>-###` — Non-Functional Requirement
- `SEC-###` — Security Requirement
- `PRIV-###` — Privacy Requirement
- `DATA-###` — Data/Entity Requirement
- `API-###` — API Requirement
- `UX-###` — UX/State Requirement
- `GAP-###` — Gap Analysis Item
- `RISK-###` — Risk Item
- `DEC-###` — Decision Log Entry
- `BL-<Track>-###` — Backlog Item

**MVP / Phase 2 / Future Classification Rules:**
- **MVP**: Required for first paid-customer-ready launch (single core loop: create event → guest onboarding → bulk upload → AI match → gallery delivery).
- **Phase 2**: Valuable but not required to validate the core loop (e.g., live/during-event upload, advanced analytics).
- **Future**: Roadmap items with no committed timeline (e.g., video face-matching, multi-photographer collaboration).

**Assumptions Policy:** Any assumption made to fill a gap is explicitly labeled `Assumption` and listed in Section 15. Assumptions are not final business decisions — they must be confirmed by the Product Owner before implementation.

**Open-Decision Policy:** Any unresolved question that blocks implementation is logged as an `Open Decision` with an owner and deadline placeholder in Section 15 and Section 14 (Final Decision List).

---

## 1.1 Confirmed Technology Stack

*(Added post-draft, supersedes any stack examples used illustratively elsewhere in this document — e.g., mentions of "AWS Rekognition," "SQS," or "ECS/Fargate" as recommendations should be read against this confirmed stack.)*

| Layer | Confirmed Choice | Notes |
|---|---|---|
| Stack pattern | **MERN** (MongoDB, Express, React, Node.js) | Replaces earlier PostgreSQL/Next.js draft proposal |
| Frontend | **React**, hosted on **Vercel** | Client-rendered; guest, photographer, and admin surfaces all served from this app |
| Backend API | **Express.js (Node.js)**, hosted on **Vercel Serverless Functions** | Handles auth, events, guest, admin, billing endpoints |
| Async workers (image pipeline, face matching) | **Node.js worker process (e.g., BullMQ + Redis), hosted on a separate always-on service** (not Vercel) | Required because Vercel serverless functions cannot run persistent queue listeners or long-running jobs (see NFR-REL-001, FR-PIPE-001) |
| Database | **MongoDB** (Atlas recommended for managed hosting) | Multi-tenant collections; `tenant_id` enforced via application-layer middleware rather than relational constraints (see Section 10 note) |
| Vector search (face matching) | **MongoDB Atlas Vector Search** | Supports event-scoped filtering alongside vector similarity (FR-MATCH-001, NFR-SCALE-002) |
| Object storage | **AWS S3** (private buckets, no public ACLs) | Unchanged from original draft — SEC-003/004/005 |
| CDN / delivery | **AWS CloudFront** with signed URLs, or Vercel edge for static assets | Protected media always via signed, short-lived URLs |
| Payment provider | **Razorpay** (subscriptions + webhooks) | Replaces Stripe in all references below (FR-PLAN-005, Section 14, Section 17, Section 18) |
| Face detection/embedding | Managed provider behind an internal abstraction interface (GAP-019) | Provider selection remains an Open Decision (Section 14); must be callable from a standard Node.js backend |

This section is the authoritative record of stack decisions; where any other section of this PRD references a specific technology only as an illustrative example (not a hard requirement from the original source prompt), this table takes precedence.

### 1.1.1 Vercel Deployment Architecture (Corrected — Architecture Decision)

**Single unified Vercel project — do not split into two projects.**

This project uses a **single Vercel project** (importing from the repo root, root directory = `./`) that serves both the frontend and backend API from one deployment. Do NOT create a separate backend-only or frontend-only Vercel project — two-project setups fail for the following reasons:

- **Backend can't run as a traditional server on Vercel.** Vercel is a serverless platform. A long-running `node index.js` process (Express listening on a port) is not supported. The backend must be wrapped as a Serverless Function via `api/index.js`.
- **Split projects cause /api 404s and CORS failures.** The frontend makes all API calls to relative URLs (`/api/...`). If frontend and backend are on different Vercel projects/domains, relative calls hit the CDN (no backend there) and absolute cross-origin calls require complex CORS configuration.

**How the unified deployment is structured:**

| File/Setting | Value | Purpose |
|---|---|---|
| `api/index.js` (repo root) | `const app = require('../packages/server/src/app'); module.exports = app;` | Vercel Serverless Function entry point — imports the Express app without duplicating logic |
| `packages/server/src/app.js` | Exports the Express app via `module.exports = app`. Never calls `app.listen()` | Shared between local dev (called by `packages/server/src/index.js`) and Vercel (called by `api/index.js`) |
| `packages/server/src/index.js` | Calls `connectDB()` then `app.listen(port)` | **Local dev only** — not used by Vercel |
| `vercel.json` `buildCommand` | `npm run build` | Runs `cd packages/client && npx vite build` (defined in root `package.json`) |
| `vercel.json` `outputDirectory` | `packages/client/dist` | Where Vite puts the built frontend |
| `vercel.json` rewrite `/api/(.*)` → `/api/index.js` | Routes all `/api/*` requests to the Express serverless function | Must point to `api/index.js`, not `/api/$1` (which would loop) |
| `vercel.json` rewrite `/(.*)` → `/index.html` | SPA fallback — all non-API routes serve the React app | Required for client-side routing |
| `vercel.json` `functions["api/index.js"]` | `includeFiles: "packages/server/src/**"` | Bundles server source into the serverless function |

**Worker is NOT part of this Vercel project.** `packages/worker` (BullMQ + Redis) must remain on a separate always-on service (Render, Railway, Fly.io, or VPS). This does not change — Vercel's 30-second max function duration is incompatible with persistent queue listeners. (See NFR-REL-001, FR-PIPE-001.)

**MongoDB Atlas Network Access** must be set to allow `0.0.0.0/0` (Allow Access From Anywhere) because Vercel serverless functions run on dynamic AWS IPs that change with every invocation and cannot be statically whitelisted.



## 2. Executive Summary

The product is a multi-tenant SaaS platform that helps professional photographers and photography businesses deliver personalized, AI-matched photo galleries to event guests, eliminating manual sorting and enabling guests to find "their" photos in seconds via a selfie-based face-matching flow ("Find My Photos").

**Problem it solves:** Event photographers routinely produce thousands of photos per event and have no scalable way to help each guest find only the photos relevant to them. Guests dislike scrolling through huge undifferentiated galleries. Businesses running many events need centralized control over storage, AI cost, subscription plans, and abuse prevention.

**Who uses it:**
- **Photographers/Photography Businesses** — create accounts, configure events, upload photos, monitor processing and usage.
- **Guests** — attendees of an event who scan a QR code to view the gallery or find personal photos.
- **Admins/Platform Operators** — manage tenants, subscription plans, quotas, and platform health.

**Why it exists:** No hard requirement previously existed to combine (a) multi-tenant SaaS operations, (b) privacy-conscious biometric matching scoped strictly to a single event, and (c) a configurable commercial model, in one implementation-ready package.

**Core user value:**
- Photographer: faster delivery, differentiated offering, reduced manual labor, usage-based commercial model.
- Guest: near-instant personalized gallery, mobile-first, no account required for basic use.
- Admin: full commercial and operational control without code changes.

**High-level business model:** Subscription-based SaaS for photographers, with plans defining usage quotas (events, storage, guests, AI matching volume). *(Recommended Requirement — pricing values themselves remain deferred per Section 76.)*

**High-level system workflow:** Photographer account → profile → subscription plan selection → event creation → dual QR code generation → guest onboarding (gallery view or Find My Photos with consent) → selfie capture/validation → post-event bulk photo upload to private S3 → asynchronous AI pipeline (face detection, representation, event-scoped matching) → personalized gallery generation → secure guest delivery → photographer/admin monitoring dashboards.

**MVP boundaries:** Account/auth, photographer profile, configurable subscription plans (admin-managed, no hardcoded pricing), event creation with dual QR codes, guest consent + selfie capture, **post-event bulk upload only** (live upload is Phase 2), asynchronous face detection/indexing/matching scoped to a single event, personalized gallery with derivative-based secure delivery, basic photographer and admin dashboards.

**Major future expansion:** Live/during-event upload (Phase 2), advanced analytics, multi-photographer/team collaboration on one event, video face-matching, on-site kiosk mode, white-label/reseller model.

**Main product risks:** face-matching accuracy and false positives/negatives; biometric privacy/legal obligations across jurisdictions; AI/inference cost at scale; storage/bandwidth cost; upload reliability on poor guest/photographer connectivity; abuse (scraping, unauthorized access to other guests' photos); subscription/quota abuse; vendor lock-in on AI/face-processing provider.

---

## 3. Product Vision

- **Long-term vision:** Become the default personalized-delivery layer for professional event photography, extending beyond static galleries into full guest engagement (video, live moments, multi-event guest identity with consent).
- **Product mission:** Remove the manual burden of matching guests to photos while treating biometric data with the highest available standard of privacy and control.
- **Product principles:** Security-first; privacy-first; multi-tenant isolation by design; backend enforcement over frontend trust; mobile-first guest experience; fully responsive dashboards; MVP-first delivery; asynchronous AI processing; configurable commercial model (no hardcoded prices/quotas).
- **Differentiation (functional, not marketing):** Two distinct QR codes separating "browse gallery" from "find my photos with consent"; strict per-event scoping of biometric matching (no cross-event guest profile in MVP); derivative-first delivery (originals protected by default); admin-configurable commercial rules without redeployment.
- **UX principles:** Guest flow must work with zero friction on mobile, tolerate poor connectivity, and clearly communicate "processing not ready yet" states. Photographer/admin dashboards must be fully responsive and understandable without an AI background.
- **Privacy principles:** Explicit consent before biometric processing; data minimization; matching scoped to a single event; configurable retention with default deletion windows; guest right to opt out/delete.
- **Technical principles:** Asynchronous processing for anything AI-related; queue-based image pipeline; private-by-default storage; derivatives for delivery, originals preserved per policy; feature flags over hardcoded business rules.
- **Scalability principles:** Stateless application tier, horizontally scalable workers, S3 for durable object storage, vector-search-capable face index that can scale per tenant/event without a full rewrite.

---

## 4. Problem Statement

**Photographer pain points:** thousands of unsorted photos per event; no scalable personalized-distribution mechanism; high storage/bandwidth costs; unpredictable AI processing time; guest communication overhead; privacy/security liability for biometric-adjacent data; need for gallery management tooling.

**Guest pain points:** cannot manually find themselves across large galleries; unwilling to browse; expects mobile-first access; may arrive before photos are processed; may have poor venue connectivity; does not understand what "AI processing" means or why it takes time.

**Business/Admin pain points:** operating a multi-tenant SaaS reliably; enforcing plan limits; controlling AI/storage cost at scale; preventing abuse (bulk scraping, fake accounts, quota gaming); providing support; managing billing and monitoring platform health.

---

## 5. Goals and Non-Goals

**Goals (MVP, measurable):**
1. A guest can go from selfie capture to viewing a personalized gallery without human intervention (`FR-GUEST-*`).
2. A photographer can configure an event and receive two distinct, functioning QR codes within minutes of event creation (`FR-EVENT-*`).
3. Face matching is strictly scoped to the guest's own event; no cross-event or cross-tenant leakage (`SEC-*`, `PRIV-*`).
4. All protected media is served via private, time-limited access — never permanent public S3 URLs (`SEC-005`).
5. Admins can change plan quotas/prices/retention without a code deployment (`FR-ADMIN-CONFIG-*`).
6. Every core operation has defined success/loading/empty/failure/retry/permission-denied UX states (`UX-*`).

**Non-Goals (MVP):**
- Live/during-event upload (explicitly Phase 2).
- Building a custom facial-recognition model from scratch (use a proven managed or open-source component unless a documented exception exists).
- Cross-event guest identity/profile persistence (Future Consideration, requires stronger consent model).
- Public marketplace/print fulfillment integration (Future Consideration).
- Final commercial pricing (explicitly deferred; only the *mechanism* for configuring pricing is in scope).

---

## 6. Personas and Roles

| Role | Description | Key Needs |
|---|---|---|
| **Photographer / Business Owner** | Owns a tenant account; may represent a solo photographer or a studio | Fast event setup, reliable bulk upload, monitoring, predictable costs |
| **Studio Staff (Future)** | Team member under a photographer's tenant | Delegated access, scoped permissions |
| **Guest** | Event attendee, generally unauthenticated or lightly authenticated | Fast personalized access, privacy control, mobile usability |
| **Platform Admin** | Anthropic-analogous platform operator role for this SaaS | Tenant oversight, plan configuration, abuse control, support tooling |
| **Coding Agent (consumer of this PRD)** | Non-human implementer | Unambiguous requirement IDs, explicit dependencies, no undocumented assumptions |

---

## 7. Core System Workflow (Narrative + Diagram)

**Narrative:**
1. Photographer registers and configures a profile (business name, branding, contact).
2. Photographer selects a subscription plan (admin-configured quotas/features).
3. Photographer creates an event (name, date, venue, privacy/retention policy selection within admin-allowed bounds).
4. System generates **two distinct QR codes**:
   - **QR-A (Gallery/Info Access):** guest views general event info and/or the full/browsable gallery (subject to event policy).
   - **QR-B (Find My Photos):** guest is routed to the consent + selfie-capture flow.
5. Guest scans QR-B → sees a privacy notice/consent screen → must explicitly consent before any biometric-adjacent processing occurs.
6. Guest captures or uploads a selfie → system validates image quality and detects a usable face before accepting it.
7. Photographer conducts the event (out of system scope).
8. After the event, photographer bulk-uploads event photos (MVP upload path).
9. Photos land in private, tenant-isolated AWS S3 storage.
10. An asynchronous image-processing pipeline runs: format validation → derivative generation → face detection → face representation/indexing (event-scoped).
11. Guest's reference face embedding is matched only against faces indexed within that guest's specific event.
12. A personalized gallery is generated per guest (or per matched face cluster) as matches are found.
13. Guest securely views/downloads permitted photos (derivatives by default; originals per event policy).
14. Photographer/Admin dashboards show event status, storage usage, upload/processing progress, guest activity, and subscription state.

**High-Level Sequence (Mermaid):**
```mermaid
sequenceDiagram
    participant P as Photographer
    participant S as Platform
    participant G as Guest
    participant W as AI Worker
    participant S3 as Private S3

    P->>S: Create account / profile
    P->>S: Select subscription plan
    P->>S: Create event
    S-->>P: QR-A (Gallery), QR-B (Find My Photos)
    G->>S: Scan QR-B
    S-->>G: Privacy notice / consent
    G->>S: Consent + selfie capture
    S->>S: Validate face presence/quality
    P->>S: Bulk upload event photos (post-event)
    S->>S3: Store originals (private)
    S->>W: Enqueue processing job
    W->>S3: Read image, generate derivatives
    W->>W: Detect + represent faces
    W->>S: Store face vectors (event-scoped)
    S->>S: Match guest reference vs event vectors
    S-->>G: Notify gallery ready
    G->>S: View / download personalized gallery
    S-->>S3: Signed URL for derivative delivery
```

---

## 8. Functional Requirements

### 8.1 Authentication & Account Management
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-AUTH-001 | System shall support photographer account registration (email + password, plus optional social/SSO — **Open Decision**: providers TBD). | MVP |
| FR-AUTH-002 | System shall support secure login, logout, password reset, and email verification. | MVP |
| FR-AUTH-003 | System shall support role-based access: Photographer, Studio Staff (Phase 2), Admin. | MVP (Photographer/Admin), Phase 2 (Staff) |
| FR-AUTH-004 | Guest access shall not require full account creation for MVP; a lightweight session/token tied to the event and consent record is sufficient. **Recommended Decision.** | MVP |
| FR-AUTH-005 | All authentication tokens shall be short-lived with refresh support; guest tokens shall be scoped to a single event. | MVP |

### 8.2 Photographer Profile
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-PROFILE-001 | Photographer can create/edit business profile: name, logo, contact info, branding colors (for gallery theming). | MVP |
| FR-PROFILE-002 | Profile changes shall be versioned/audited for support purposes. | Recommended — MVP |
| FR-PROFILE-003 | Photographer can view current subscription plan and usage against quota from the profile/dashboard. | MVP |

### 8.3 Subscription & Plan Management
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-PLAN-001 | Admin shall define subscription plans (name, price, currency, quotas: max events, max photos/event, max storage, max guests/event, max AI matches, feature flags) via an admin interface — **no hardcoded values in application code.** | MVP |
| FR-PLAN-002 | Photographer selects a plan during onboarding and can upgrade/downgrade later. | MVP |
| FR-PLAN-003 | System shall enforce plan quotas at the backend for every quota-relevant operation (event creation, upload, guest count, AI match count). | MVP |
| FR-PLAN-004 | System shall track and expose real-time usage vs. quota per tenant. | MVP |
| FR-PLAN-005 | Payment processing integrated with **Razorpay** (subscriptions + webhooks) — see Section 14. | MVP |
| FR-PLAN-006 | System shall support plan trials, if configured by admin (duration configurable, not hardcoded). | Recommended — MVP |
| FR-PLAN-007 | System shall support grace periods and dunning management on payment failure. | Phase 2 |

### 8.4 Event Management
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-EVENT-001 | Photographer can create an event with: name, date(s), venue, cover image, privacy/retention policy (within admin-configured bounds), gallery access mode. | MVP |
| FR-EVENT-002 | On event creation, system generates **two distinct QR codes**: QR-A (Gallery/Info) and QR-B (Find My Photos). Each QR shall encode a unique, non-guessable event-scoped token. | MVP |
| FR-EVENT-003 | Photographer can regenerate/revoke a QR code (e.g., if leaked), invalidating the old one. | Recommended — MVP |
| FR-EVENT-004 | Photographer can configure gallery access mode: Public-within-event, Link-only, or Find-My-Photos-only. | MVP |
| FR-EVENT-005 | Photographer can close/archive an event, which halts new guest onboarding while preserving already-generated galleries per retention policy. | MVP |
| FR-EVENT-006 | Event dashboard shows: guest count, photo count, processing status, storage used, matches generated. | MVP |
| FR-EVENT-007 | Photographer can permanently delete an event, triggering cascade deletion of all related data (photos, derivatives, face detections, matches, guests, consent records, reference faces) from MongoDB and S3. Deletion is async via BullMQ worker to handle large events within Vercel's timeout. Event is marked as 'deleting' during processing. This also satisfies PRIV-003 for guest data deletion when an event is removed. | MVP |

### 8.5 Guest Onboarding & Consent
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-GUEST-001 | Guest scanning QR-A shall land on event info / browsable gallery (if enabled by event policy), no consent required for browsing non-personalized content. | MVP |
| FR-GUEST-002 | Guest scanning QR-B shall be shown a clear, plain-language privacy/biometric consent notice before any face processing occurs. | MVP |
| FR-GUEST-003 | Consent shall be explicitly recorded (timestamp, event ID, consent text version, guest token) before selfie capture is permitted. | MVP |
| FR-GUEST-004 | Guest must be able to decline consent and still access the general gallery (if event policy allows) without penalty. | MVP |
| FR-GUEST-005 | Guest can withdraw consent and request deletion of their reference selfie/face vector at any time (self-service or via support). | MVP |
| FR-GUEST-006 | Guest UI shall be mobile-first, responsive, and function on common mobile browsers without app installation. | MVP |

### 8.6 Selfie Capture & Validation
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-SELFIE-001 | Guest can capture a selfie via device camera or upload an existing photo. | MVP |
| FR-SELFIE-002 | System shall validate image quality (resolution, brightness/blur heuristics) before acceptance. | MVP |
| FR-SELFIE-003 | System shall detect exactly one clearly usable face in the reference image; multiple/zero faces shall trigger a retry prompt with guidance. | MVP |
| FR-SELFIE-004 | Reference selfie shall be processed to a face embedding and shall not be publicly viewable by other guests. | MVP |
| FR-SELFIE-005 | Guest shall receive clear feedback states: uploading, validating, accepted, rejected-with-reason, processing. | MVP |

### 8.7 Photo Upload (Photographer)
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-UPLOAD-001 | Photographer can bulk-upload event photos after the event (MVP upload workflow). | MVP |
| FR-UPLOAD-002 | Uploads shall go directly to S3 via pre-signed URLs (avoiding proxying large files through the application server). | MVP |
| FR-UPLOAD-003 | System shall support resumable/chunked upload for large batches and unreliable connections. | MVP |
| FR-UPLOAD-004 | System shall validate file type/size against admin-configured limits before accepting into the processing queue. | MVP |
| FR-UPLOAD-005 | System shall detect and flag duplicate uploads (hash-based) to avoid redundant storage/processing cost. | Recommended — MVP |
| FR-UPLOAD-006 | Live/during-event upload (near-real-time ingestion during the event) is explicitly **Phase 2**. | Phase 2 |
| FR-UPLOAD-007 | Upload UI shall show per-file and batch-level progress, failure, and retry states. | MVP |

### 8.8 Asynchronous Image Processing Pipeline
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-PIPE-001 | All AI/image processing shall run asynchronously via a queue/worker architecture; the upload request shall never block on processing. | MVP |
| FR-PIPE-002 | Pipeline stages: ingest validation → derivative generation (thumbnail, web-optimized, optional watermark) → face detection → face representation (embedding) → indexing (event-scoped) → matching. | MVP |
| FR-PIPE-003 | Each stage shall be independently retryable and idempotent to tolerate partial failures. | MVP |
| FR-PIPE-004 | Failed photos shall be flagged with a reason and surfaced to the photographer with a retry action. | MVP |
| FR-PIPE-005 | Processing status shall be visible in near-real-time on the photographer dashboard (queued/processing/done/failed counts). | MVP |

### 8.9 Face Matching & Gallery Generation
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-MATCH-001 | Face matching shall be strictly scoped to the guest's own event; no comparison against other events/tenants. | MVP |
| FR-MATCH-002 | System shall use a similarity threshold (admin-configurable) to determine a match; matches below threshold are excluded. | MVP |
| FR-MATCH-003 | System shall support incremental matching as new photos are processed after a guest's gallery has already been generated. | MVP |
| FR-MATCH-004 | Guest shall be notified (in-app/email, per consent) when new matches are found post-initial-delivery. | Recommended — MVP |
| FR-MATCH-005 | System shall log match confidence scores for support/quality review (not shown to guest by default). | MVP |

### 8.10 Guest Gallery Delivery
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-GALLERY-001 | Guest gallery shall display only derivative (optimized) images by default, not originals. | MVP |
| FR-GALLERY-002 | Download availability (derivative vs. original, watermarked vs. clean) shall be configurable per event/plan. | MVP |
| FR-GALLERY-003 | All media delivery URLs shall be short-lived, signed, and non-guessable (no permanent public S3 URLs). | MVP |
| FR-GALLERY-004 | Gallery shall show a clear "processing not finished yet" state if the guest arrives before matching completes. | MVP |
| FR-GALLERY-005 | Guest can favorite/select photos for download rather than only bulk-download. | Recommended — MVP |

### 8.11 Photographer/Admin Monitoring
| ID | Requirement | MVP/Phase |
|---|---|---|
| FR-MON-001 | Photographer dashboard shows per-event: storage used, photos uploaded/processed, guests onboarded, matches generated, quota remaining. | MVP |
| FR-MON-002 | Admin dashboard shows platform-wide: tenant list, plan distribution, storage totals, AI processing volume/cost proxy, abuse flags. | MVP |
| FR-MON-003 | Admin can suspend/reinstate a tenant or event for abuse or non-payment. | MVP |

---

## 9. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-PERF-001 | Performance | Guest gallery initial load shall render in under 3 seconds on 4G for the first screen of content. |
| NFR-PERF-002 | Performance | Pre-signed upload URL generation shall respond in under 500ms p95. |
| NFR-SCALE-001 | Scalability | Processing workers shall scale horizontally independent of the web tier. |
| NFR-SCALE-002 | Scalability | Face index/vector search shall support per-tenant partitioning to bound search space and cost. |
| NFR-AVAIL-001 | Availability | Core guest-facing gallery access shall target 99.5% monthly uptime (MVP target — **Open Decision** for SLA commitments). |
| NFR-REL-001 | Reliability | Upload and processing pipeline shall guarantee at-least-once processing with idempotent stage handling. |
| NFR-SEC-001 | Security | All data in transit shall use TLS 1.2+; all data at rest (S3, DB) shall be encrypted. |
| NFR-PRIV-001 | Privacy | Biometric-derived data (face embeddings) shall never be exposed via any public/unauthenticated API. |
| NFR-USAB-001 | Usability | Guest flow shall be usable without instructions by a first-time, non-technical user on mobile. |
| NFR-ACC-001 | Accessibility | Guest and dashboard UIs shall meet WCAG 2.1 AA where feasible for MVP. |
| NFR-MAINT-001 | Maintainability | No business-critical constant (price, quota, retention period, feature availability) shall be hardcoded in application code. |
| NFR-OBS-001 | Observability | All pipeline stages shall emit structured logs/metrics for latency, failure rate, and queue depth. |

---

## 10. Data Model / Core Entities (Summary)

| Entity | Key Attributes | Notes |
|---|---|---|
| **Tenant (Photographer Account)** | id, business_name, plan_id, status, created_at | Root of multi-tenant isolation |
| **User** | id, tenant_id (nullable for admin), role, email, auth_provider | Photographer/staff/admin |
| **Plan** | id, name, price, currency, quotas (JSON/config), features (JSON), trial_days | Fully admin-editable |
| **Subscription** | id, tenant_id, plan_id, status, razorpay_subscription_id, current_period | Tied to Razorpay |
| **Event** | id, tenant_id, name, date, venue, access_mode, retention_policy_id, qr_a_token, qr_b_token, status | qr tokens unique, revocable |
| **Guest** | id, event_id, session_token, consent_record_id, created_at | No cross-event identity in MVP |
| **ConsentRecord** | id, guest_id, event_id, consent_text_version, consented_at, withdrawn_at (nullable) | Immutable append-only log |
| **ReferenceFace** | id, guest_id, embedding_ref, quality_score, created_at, deleted_at (nullable) | Embedding stored separately from image where feasible |
| **Photo** | id, event_id, tenant_id, s3_original_key, status, upload_batch_id, hash | Status: uploaded/processing/processed/failed |
| **PhotoDerivative** | id, photo_id, type (thumbnail/web/watermarked), s3_key | Delivery-facing assets |
| **FaceDetection** | id, photo_id, bounding_box, embedding_ref, quality_score | Event-scoped index membership |
| **Match** | id, guest_id, photo_id, confidence_score, created_at | Drives gallery personalization |
| **RetentionPolicy** | id, tenant_id (or plan-level default), original_retention_days, face_data_retention_days, deletion_rules | Configurable, not hardcoded |
| **AuditLog** | id, actor_id, action, target_type, target_id, timestamp | Security/compliance trail |

*(Full schema, indexes, and constraints are an implementation-detail deliverable beyond this PRD's narrative scope, but must respect: `tenant_id` present on every tenant-scoped collection and enforced via application-layer query middleware — since MongoDB has no native foreign-key enforcement, this check must not be optional or bypassable per-query; face-related collections never joinable across events without an explicit, audited override.)*

---

## 11. API Requirements (Representative, Not Exhaustive)

| ID | Endpoint (representative) | Purpose | Auth |
|---|---|---|---|
| API-001 | `POST /auth/register` | Photographer registration | Public |
| API-002 | `POST /auth/login` | Photographer/admin login | Public |
| API-003 | `POST /events` | Create event | Photographer |
| API-004 | `GET /events/:id/qr` | Retrieve/regenerate QR codes | Photographer |
| API-005 | `POST /guest/consent` | Record guest consent | Guest token |
| API-006 | `POST /guest/selfie` | Upload/validate reference selfie | Guest token |
| API-007 | `POST /events/:id/photos/upload-url` | Get pre-signed S3 upload URL | Photographer |
| API-008 | `GET /events/:id/status` | Processing/upload status | Photographer |
| API-009 | `GET /guest/gallery` | Retrieve personalized gallery (signed derivative URLs) | Guest token |
| API-010 | `POST /admin/plans` | Create/update subscription plan | Admin |
| API-011 | `POST /billing/webhook` | Payment provider webhook | Provider-signed |
| API-012 | `POST /guest/consent/withdraw` | Withdraw consent / request deletion | Guest token |

**Requirement:** Every non-public endpoint must enforce tenant/ownership checks server-side (`SEC-001`); the frontend/client is never trusted for authorization decisions (`SEC-002`).

---

## 12. Security & Privacy Requirements

| ID | Requirement |
|---|---|
| SEC-001 | Every request touching tenant, event, guest, or photo data shall verify server-side that the caller is authorized for that specific tenant/event/guest scope. |
| SEC-002 | Client-supplied IDs/roles/flags shall never be trusted for authorization; all checks re-verified against backend state. |
| SEC-003 | All original and derivative media shall be stored in private S3 buckets/prefixes with no public-read ACLs. |
| SEC-004 | Media delivery shall use short-lived signed URLs (or equivalent CDN-signed cookies), expiring within a configurable short window (e.g., minutes). |
| SEC-005 | No permanent public S3 URLs shall ever be generated for protected content. |
| SEC-006 | Face embeddings shall be stored and queried in a manner that prevents cross-tenant or cross-event access, including at the database/index-partition level. |
| SEC-007 | All admin actions on tenants/plans/quotas shall be audit-logged with actor identity and timestamp. |
| SEC-008 | Rate limiting shall be applied to guest-facing endpoints (selfie upload, consent, gallery fetch) to prevent abuse/scraping. |
| PRIV-001 | Biometric-adjacent processing (face detection/matching) shall not occur without prior, explicit, recorded guest consent. |
| PRIV-002 | Consent notice shall be in plain, non-legalese language, versioned, and re-shown if materially changed. |
| PRIV-003 | Guests shall have a self-service or supported path to withdraw consent and request deletion of reference face data. |
| PRIV-004 | Face data retention shall be configurable per tenant/plan with a sensible default (**Open Decision**: default value, see Section 76). |
| PRIV-005 | Legal/privacy review is required prior to launch in any jurisdiction with specific biometric statutes (e.g., BIPA-type laws) — **Recommended Requirement**, not a substitute for actual legal counsel. |
| PRIV-006 | Guest browsing-only mode (QR-A, no consent) shall never trigger biometric processing. |

---

## 13. Gap Analysis — Requirements the Product Owner May Have Missed

This section satisfies the explicit instruction to identify requirements not supplied verbatim but necessary for a safe, production-grade platform.

| ID | Gap Identified | Why It Matters | Classification |
|---|---|---|---|
| GAP-001 | Data residency / regional storage requirements | Biometric laws often require in-region processing/storage | Recommended Requirement |
| GAP-002 | Guest data deletion SLA (how fast a deletion request must complete) | Needed for consent-withdrawal compliance | Open Decision |
| GAP-003 | Minor/underage guest handling at events (e.g., weddings, school events) | Consent from minors typically requires guardian involvement | Open Decision — high priority |
| GAP-004 | Handling of guests who never consent but appear in others' matched photos | The person in a photo did not consent to being matched-against, only the searcher did | Recommended Requirement — needs explicit event-level photography consent/notice separate from Find-My-Photos consent |
| GAP-005 | Photographer-side copyright/ownership terms for uploaded photos | Platform needs a clear ToS on who owns/can license uploaded content | Recommended Requirement |
| GAP-006 | Abuse case: guest uploads someone else's photo as their "selfie" to snoop on others' galleries | Security/privacy risk requiring liveness or quality heuristics, not full biometric liveness for MVP | Recommended Requirement |
| GAP-007 | S3 lifecycle policies for orphaned/failed uploads | Cost and hygiene risk if not automated | Recommended Requirement |
| GAP-008 | Duplicate-photo detection cost/behavior at scale | Explicit hashing strategy needed (perceptual vs. exact hash) | Recommended Decision |
| GAP-009 | Backup and disaster recovery targets (RPO/RTO) | Required for a credible SaaS SLA | Open Decision |
| GAP-010 | Notification provider abstraction (email/SMS/push) | Needed for match-ready and account notifications; should be provider-agnostic | Recommended Requirement |
| GAP-011 | Support/helpdesk tooling for guest and photographer issues | Necessary operational requirement, easy to overlook | Recommended Requirement |
| GAP-012 | Analytics requirements (funnel: scan → consent → selfie → match → download) | Needed to measure product success, referenced in Goals | Recommended Requirement |
| GAP-013 | Watermarking rules and configurability | Affects both monetization and photographer trust | Open Decision |
| GAP-014 | Maximum event size / photo count guardrails | Needed to bound worst-case processing and cost | Open Decision |
| GAP-015 | RAW file handling strategy (accept, reject, convert) | Common photographer workflow question | Open Decision |
| GAP-016 | Payment failure / dunning / involuntary churn handling | Revenue protection | Phase 2 — Recommended |
| GAP-017 | Multi-language support for guest-facing UI | International events likely | Future Consideration |
| GAP-018 | Accessibility for guests with disabilities in the selfie-capture flow | Camera-based flows can exclude some users; need manual upload fallback (already partially covered by FR-SELFIE-001) | Recommended Requirement |
| GAP-019 | Vendor lock-in mitigation for the AI/face-matching provider | Architecture should abstract the provider behind an internal interface | Recommended Requirement |
| GAP-020 | Incident response plan for a biometric data breach | Legal/PR exposure is high for this data category | Recommended Requirement |
| GAP-021 | Terms distinguishing "browsable gallery" photos (of anyone) vs. "personally matched" photos, and photographer obligation to notify all attendees that photography/AI matching is occurring at the event (e.g., signage) | Real-world legal/ethical requirement independent of the app | Recommended Requirement |
| GAP-022 | Test/staging environment with synthetic (non-real) face data for QA, to avoid using real biometric data in lower environments | Privacy-safe QA practice | Recommended Requirement |

---

## 14. Final Decision List (Configuration & Provider Decisions)

For each item: Current State / Recommendation / Reason / Impact if Delayed / Decision Owner / Deadline.

| Topic | Current State | Recommendation | Reason | Impact if Delayed | Owner | Deadline |
|---|---|---|---|---|---|---|
| AI provider/architecture | Undecided | Use a managed face-detection + embedding API (e.g., a cloud vision provider) behind an internal abstraction; avoid training a custom model for MVP | Faster time-to-market, lower risk, per Principle #22 | Blocks entire matching pipeline | *[Owner TBD]* | *[Date TBD]* |
| Vector search technology | **Confirmed** | MongoDB Atlas Vector Search, filtered by event_id for scoping | Keeps stack fully within MERN/MongoDB, avoids standing up separate vector infra for MVP | N/A — resolved | *[Owner TBD]* | *[Date TBD]* |
| Payment provider | **Confirmed** | Razorpay (subscriptions + webhooks) | Selected by Product Owner; strong support for Indian market/UPI | Blocks monetization if integration slips | *[Owner TBD]* | *[Date TBD]* |
| Notification provider | Undecided | Abstracted provider interface; e.g., SES/SendGrid for email, Twilio for SMS (Phase 2) | Avoids lock-in, MVP needs email only | Minor if delayed | *[Owner TBD]* | *[Date TBD]* |
| Face-data retention | Undecided | Default 90 days post-event, configurable per plan/tenant | Balances utility vs. privacy exposure | Legal/compliance risk if undefined at launch | *[Owner TBD]* | *[Date TBD]* |
| Event-photo retention | Undecided | Default 12 months, configurable | Storage cost control | Cost/compliance risk | *[Owner TBD]* | *[Date TBD]* |
| Guest authentication | Undecided | Lightweight event-scoped token, no full account required for MVP | Reduces friction | Higher guest drop-off if delayed/over-engineered | *[Owner TBD]* | *[Date TBD]* |
| Gallery access policy | Undecided | Configurable per event: Public-within-event / Link-only / Find-My-Photos-only | Flexibility for different event types | Photographer dissatisfaction | *[Owner TBD]* | *[Date TBD]* |
| Maximum event size | Undecided | Plan-configurable cap (e.g., soft default 10,000 photos) | Bounds worst-case processing cost | Runaway cost risk | *[Owner TBD]* | *[Date TBD]* |
| Maximum photo count | Undecided | Same as above, per-plan | Same | Same | *[Owner TBD]* | *[Date TBD]* |
| Supported formats | Undecided | JPEG/HEIC/PNG for MVP; RAW deferred | Simplifies pipeline | RAW-heavy photographers blocked at launch | *[Owner TBD]* | *[Date TBD]* |
| RAW strategy | Undecided | Phase 2: optional RAW upload with server-side JPEG conversion for processing | Large scope if done in MVP | Feature gap for pro photographers | *[Owner TBD]* | *[Date TBD]* |
| Watermark rules | Undecided | Configurable per event/plan; default watermark on free/trial tier | Monetization lever | Ambiguity in delivery quality | *[Owner TBD]* | *[Date TBD]* |
| Download rules | Undecided | Derivative by default; original download gated by plan/event policy | Protects photographer's commercial interest in originals | Photographer trust risk | *[Owner TBD]* | *[Date TBD]* |
| Pricing | Deferred by explicit instruction | N/A — mechanism only | Business decision outside PRD scope | N/A | *[Owner TBD]* | *[Date TBD]* |
| Trial | Undecided | Admin-configurable trial length, default 14 days | Standard SaaS practice | Minor | *[Owner TBD]* | *[Date TBD]* |
| Refund policy | Undecided | Deferred to legal/finance | Outside technical PRD scope | Minor for MVP | *[Owner TBD]* | *[Date TBD]* |
| Target countries | Undecided | Start with home market; expand pending data-residency/legal review | Biometric law variance | Legal exposure if expanded prematurely | *[Owner TBD]* | *[Date TBD]* |
| Legal/privacy review | Not started | Mandatory before public launch, especially for biometric processing | Regulatory risk | Launch blocker | *[Owner TBD]* | *[Date TBD]* |
| Data residency | Undecided | Single-region for MVP, document expansion plan | Simplicity | Blocks certain markets | *[Owner TBD]* | *[Date TBD]* |
| Storage/CDN strategy | Undecided | S3 + CloudFront with signed URLs/cookies | Standard, private-by-default | Delivery performance/security risk if skipped | *[Owner TBD]* | *[Date TBD]* |
| Queue/worker technology | **Confirmed** | BullMQ + Redis, running on a small always-on service separate from the Vercel-hosted API (Vercel serverless functions cannot host persistent queue workers) | Preserves async, retryable pipeline requirement (FR-PIPE-001/003) while keeping API/frontend on Vercel | Architecture risk (blocking uploads) if skipped | *[Owner TBD]* | *[Date TBD]* |
| Backup strategy | Undecided | Automated DB snapshots + S3 versioning | Data-loss protection | Compliance/reliability risk | *[Owner TBD]* | *[Date TBD]* |
| RPO/RTO | Undecided | Recommend RPO ≤ 24h, RTO ≤ 4h for MVP | Reasonable SaaS baseline | SLA credibility risk | *[Owner TBD]* | *[Date TBD]* |
| Support model | Undecided | Email/ticket support for MVP | Cost-appropriate for MVP | Guest/photographer frustration if undefined | *[Owner TBD]* | *[Date TBD]* |
| Analytics requirements | Undecided | Funnel analytics (scan→consent→match→download) plus basic usage dashboards | Measures product-market fit | Blind product decisions | *[Owner TBD]* | *[Date TBD]* |
| Abuse policy | Undecided | Rate limiting + manual admin suspension for MVP; automated detection Phase 2 | Cost/complexity balance | Abuse risk if fully deferred | *[Owner TBD]* | *[Date TBD]* |

---

## 15. Assumptions & Decisions Log (Conflict Resolution)

| DEC ID | Decision/Assumption | Rationale | Status |
|---|---|---|---|
| DEC-001 | Post-event bulk upload is the only MVP upload path; live upload is Phase 2 | Explicit instruction in source prompt (Principle #8, #9) | Confirmed |
| DEC-002 | No custom facial-recognition model built from scratch for MVP | Explicit instruction (Principle #22) | Confirmed |
| DEC-003 | Guests do not require full account creation in MVP | Assumption — reduces friction, consistent with "mobile-first guest experience" principle | Assumption — needs Product Owner confirmation |
| DEC-004 | Face-data default retention = 90 days, event-photo default retention = 12 months | Assumption to unblock design; both configurable per Principle #16 | Assumption — needs Product Owner confirmation |
| DEC-005 | RAW file support deferred to Phase 2 | Assumption to bound MVP scope | Assumption — needs Product Owner confirmation |
| DEC-006 | Payment provider = Razorpay; stack = MERN (MongoDB/Express/React/Node), frontend + backend hosted on Vercel, object storage on AWS S3, async workers hosted separately from Vercel | Product Owner decision, confirmed post-draft (see Section 1.1) | Confirmed |
| DEC-007 | Minors/guardian consent handling is unresolved and blocks launch in relevant contexts (e.g., school events) | Gap identified in Section 13 (GAP-003) | Open Decision — high priority |
| DEC-008 | Register form showed generic "Validation failed" instead of field-level errors (BUG) | Backend validate middleware already returned `details[]` array; frontend RegisterPage.jsx only read the top-level `error` string. Fixed in session 2026-09-21: catch block now reads `details[]` and joins messages; password placeholder updated to show full complexity requirement (uppercase + lowercase + digit). FR-AUTH-001, SEC-002. | Confirmed — Fixed |
| DEC-010 | FR-EVENT-007: Permanent event deletion with async cascade delete added in session 2026-09-28 | Photographer needed ability to permanently remove events (not just archive). Cascade delete removes all related DB records (Matches, FaceDetections, PhotoDerivatives, Photos, Guests, ConsentRecords, ReferenceFaces, Event) and S3 objects. Async via BullMQ to handle large events within Vercel 30s timeout. Event marked as 'deleting' status during processing. Also satisfies PRIV-003 (guest biometric data deletion) when entire event is removed. Frontend uses strong confirmation (type event name). | Confirmed |
| DEC-009 | Phase 8 Admin Plan CRUD is incomplete — Plan collection was empty, causing a deadlock (BUG / Phase 8 gap) | Plan model exists and quotaCheck middleware correctly reads planId from Tenant, but there are no admin API routes (`POST/PUT/PATCH /api/admin/plans`) and no admin UI page for plan creation (FR-PLAN-001, API-010, SEC-007). Interim workaround: seed script (`packages/server/scripts/seedPlans.js`) inserted 3 default plans (Free Trial ₹0, Pro ₹1,499/mo, Studio ₹3,999/mo) on 2026-09-21. Permanent fix (admin plan CRUD) deferred to Phase 12. | Confirmed — Seed applied; admin CRUD deferred to Phase 12 |

---

## 16. Risks and Mitigation

| ID | Risk | Probability | Impact | Risk Level | Mitigation | Detection | Contingency |
|---|---|---|---|---|---|---|---|
| RISK-001 | Face-matching false positives/negatives | Medium | High | High | Configurable similarity threshold; manual review path; guest feedback loop | Match confidence logging | Allow guest self-search/browse fallback |
| RISK-002 | Biometric privacy/legal non-compliance | Medium | Very High | Critical | Legal review pre-launch; consent-first design; configurable retention/deletion | Compliance audit | Geo-restrict launch markets |
| RISK-003 | AI processing cost overrun at scale | Medium | High | High | Plan-based quotas; async batch processing; provider cost monitoring | Cost dashboards/alerts | Throttle or pause processing per tenant |
| RISK-004 | Storage cost overrun | Medium | Medium | Medium | Lifecycle policies; derivative-first delivery; retention enforcement | Storage usage alerts | Enforce quota hard caps |
| RISK-005 | Bandwidth cost from downloads | Medium | Medium | Medium | CDN caching; signed URL expiry tuning | CDN cost monitoring | Rate-limit downloads |
| RISK-006 | Guest poor connectivity/slow uploads | High | Medium | Medium | Resumable upload; progressive image loading | Client error telemetry | Provide offline-friendly retry UX |
| RISK-007 | Processing delay frustrates guests | High | Medium | Medium | Clear "not ready yet" UX; notification on completion | Queue depth metrics | Prioritize small events first |
| RISK-008 | AI provider outage | Low | High | Medium | Provider abstraction layer; queue-based retry | Provider status monitoring | Manual fallback / delayed processing |
| RISK-009 | S3/storage outage | Low | High | Medium | Multi-AZ S3 durability (native), versioning | AWS status monitoring | Communicate delay to tenants |
| RISK-010 | Abuse (scraping, unauthorized gallery access) | Medium | High | High | Signed URLs, rate limiting, token scoping | Anomaly detection on request patterns | Revoke tokens, suspend tenant/event |
| RISK-011 | Unauthorized access to another guest's gallery | Low | Very High | High | Strict per-guest token scoping, no predictable IDs | Access audit logs | Immediate token revocation, incident review |
| RISK-012 | Subscription/quota abuse (e.g., fake accounts to bypass limits) | Medium | Medium | Medium | Email verification, anomaly detection | Signup pattern monitoring | Manual admin suspension |
| RISK-013 | Traffic spikes (large/viral event) | Medium | Medium | Medium | Autoscaling workers/app tier | Load metrics | Queue-based backpressure |
| RISK-014 | Database scaling limits | Low | High | Medium | Partition by tenant; read replicas | DB performance monitoring | Vertical scale / sharding plan |
| RISK-015 | Vendor lock-in (AI/face provider) | Medium | Medium | Medium | Internal abstraction interface (GAP-019) | Architecture review | Swap provider behind interface |
| RISK-016 | Notification failures | Low | Low | Low | Provider abstraction, retry queue | Delivery failure logs | Fallback provider |
| RISK-017 | Payment failure handling gaps | Medium | Medium | Medium | Stripe dunning tooling (Phase 2) | Billing webhook monitoring | Manual account hold |

---

## 17. Development Roadmap

| Phase | Focus | Key Features | Dependencies | Exit Criteria |
|---|---|---|---|---|
| Phase 0 | Discovery & Architecture | Finalize open decisions (Section 14), architecture diagrams, provider selection | Stakeholder availability | All Section 14 items resolved or explicitly deferred with sign-off |
| Phase 1 | Foundation/Auth | Account system, roles, tenant model | Phase 0 | Photographer can register/login |
| Phase 2 | Photographer/Profile/Event | Profile, event creation, dual QR generation | Phase 1 | Event created with working QR-A/QR-B |
| Phase 3 | Upload/S3 | Pre-signed upload, bulk upload UI, private storage | Phase 2 | Photos land in private S3, status tracked |
| Phase 4 | Image Processing | Derivative generation, queue/worker pipeline | Phase 3 | Derivatives generated asynchronously and reliably |
| Phase 5 | AI Face Identification | Face detection, embedding, event-scoped index, matching | Phase 4 | Guest selfie correctly matches seeded test photos |
| Phase 6 | Guest Gallery | Consent flow, selfie capture, personalized gallery delivery | Phase 5 | End-to-end guest flow functional |
| Phase 7 | Subscription/Billing | Plan config, Razorpay integration, quota enforcement | Phase 1 (parallelizable) | Photographer can subscribe and be quota-limited |
| Phase 8 | Admin Panel | Tenant management, plan config UI, abuse controls | Phase 7 | Admin can configure plans without deployment |
| Phase 9 | Security/Testing | Pen-testing, load testing, privacy review | Phases 1–8 | No critical security findings open |
| Phase 10 | Deployment | Production infra, CI/CD, monitoring | Phase 9 | Production environment live |
| Phase 11 | Production Hardening | Observability, backup/DR validation, cost tuning | Phase 10 | SLA targets met in production for 30 days |
| Phase 12 | Phase 8 Gap-Closure + Launch Readiness | Admin Plan CRUD (FR-PLAN-001, API-010, SEC-007): `GET/POST /api/admin/plans`, `PUT /api/admin/plans/:planId`, `PATCH /api/admin/plans/:planId/status` + `PlanManagePage.jsx` UI; register-form field-error UX (DEC-008, done); legal/privacy review pre-launch (PRIV-005); final production go/no-go checklist | Phase 10/11 | Admin can create/edit/archive plans from UI without any deployment; no critical open Phase 8 items; legal review signed off |

---

## 18. Implementation Backlog (Representative Sample)

| ID | Track | Description | Priority | MVP/Phase | Related Req. |
|---|---|---|---|---|---|
| BL-PROD-001 | Product | Define final MVP scope sign-off doc from Section 14 decisions | High | MVP | DEC-* |
| BL-UX-001 | UX/UI | Design consent + selfie capture flow with all UX states | High | MVP | FR-GUEST-*, FR-SELFIE-* |
| BL-FE-001 | Frontend | Build guest gallery PWA-style mobile web app | High | MVP | FR-GALLERY-* |
| BL-FE-002 | Frontend | Build photographer dashboard (event, upload, monitoring) | High | MVP | FR-MON-*, FR-UPLOAD-* |
| BL-BE-001 | Backend | Implement tenant-scoped authorization middleware | Critical | MVP | SEC-001, SEC-002 |
| BL-BE-002 | Backend | Implement pre-signed S3 upload endpoint with quota checks | High | MVP | FR-UPLOAD-002/004 |
| BL-DB-001 | Database | Design multi-tenant schema with tenant_id enforcement | Critical | MVP | DATA-* |
| BL-AWS-001 | AWS/S3 | Configure private buckets, lifecycle policies, CloudFront signed URLs | Critical | MVP | SEC-003/004/005, GAP-007 |
| BL-IMG-001 | Image Processing | Build async pipeline (queue + workers) for derivative generation | Critical | MVP | FR-PIPE-* |
| BL-AI-001 | AI | Integrate managed face-detection/embedding provider behind internal interface | Critical | MVP | FR-MATCH-*, GAP-019 |
| BL-NOTIF-001 | Notifications | Abstract notification provider (email) for match-ready alerts | Medium | MVP | GAP-010 |
| BL-BILL-001 | Billing | Integrate Razorpay subscriptions + webhooks | High | MVP | FR-PLAN-005 |
| BL-ADMIN-001 | Admin | Build plan configuration UI (quotas/features, no redeploy) | Critical | MVP | FR-PLAN-001 |
| BL-SEC-001 | Security | Implement rate limiting on guest endpoints | High | MVP | SEC-008 |
| BL-QA-001 | QA | Build synthetic face-data test suite (no real biometric data in staging) | High | MVP | GAP-022 |
| BL-DEVOPS-001 | DevOps | Set up CI/CD, autoscaling for worker fleet, monitoring/alerting | Critical | MVP | NFR-OBS-001 |

---

## 19. Traceability Matrix (Sample Mapping)

| Source Requirement (Prompt) | PRD Requirement IDs |
|---|---|
| Two distinct QR codes | FR-EVENT-002 |
| Post-event bulk upload = MVP | FR-UPLOAD-001, FR-UPLOAD-006 |
| Live upload = Phase 2 | FR-UPLOAD-006 |
| Private S3, no public URLs | SEC-003, SEC-005, FR-GALLERY-003 |
| Asynchronous AI processing | FR-PIPE-001, NFR-REL-001 |
| Event-scoped matching only | FR-MATCH-001, SEC-006, PRIV-006 |
| Privacy consent before biometric processing | FR-GUEST-002/003, PRIV-001/002 |
| No hardcoded pricing/quotas | FR-PLAN-001, NFR-MAINT-001 |
| Admin-configurable commercial rules | FR-PLAN-001/002/003/004 |
| Gap analysis section required | Section 13 (GAP-001 to GAP-022) |

---

## 20. AI/Coding-Agent Implementation Guidance

- **Source-of-truth hierarchy:** This PRD → explicit source prompt → team decisions logged in Section 15/14. Coding agents must not invent business rules not present in one of these.
- **Requirement ID usage:** Reference requirement IDs (e.g., `FR-EVENT-002`) in commit messages, PR descriptions, and test names for traceability.
- **Dependency-first implementation:** Follow the phase order in Section 17; do not build guest gallery delivery before the upload/processing pipeline exists.
- **Existing-code-first principle:** Reuse existing services/components/models before creating new ones; check for duplication before adding a new module.
- **Security-first implementation:** Every new endpoint must implement tenant/ownership checks (SEC-001/002) before functional logic is considered complete.
- **Tenant checks:** Every query touching tenant-scoped tables must filter by tenant_id at the data-access layer, not only at the API layer.
- **Backend enforcement:** Never rely on frontend validation alone for quotas, permissions, or consent gating.
- **No duplicate components/services/models; no unnecessary dependencies; no unrelated refactoring** when implementing a specific backlog item.
- **No hard-coded commercial limits** — always read from Plan/RetentionPolicy configuration.
- **Feature flags** for any functionality not yet fully validated (e.g., live upload scaffolding).
- **Documentation updates** required after any meaningful architecture, API, database, or security change.

---

## 21. Final Self-Check Summary

This PRD has been reviewed against the source prompt's 45-point completeness checklist (Section 82 of the source prompt). Key confirmations:
- Two QR codes remain distinct (FR-EVENT-002). ✔
- Post-event bulk upload is MVP; live upload is Phase 2 (FR-UPLOAD-001/006). ✔
- Pricing remains deferred; plan prices/quotas are configurable (FR-PLAN-001, Section 14). ✔
- AI is asynchronous and event-scoped (FR-PIPE-001, FR-MATCH-001). ✔
- Multi-tenancy enforced at data/API layers (SEC-001/002/006, DATA model tenant_id). ✔
- Face privacy/consent addressed (Section 12, FR-GUEST-002/003). ✔
- Guest not-ready states addressed (FR-GALLERY-004). ✔
- Secure media delivery addressed (SEC-003/004/005). ✔
- Gap analysis, open decisions, traceability matrix, and implementation backlog are included (Sections 13, 14/15, 19, 18). ✔
- Testing, deployment, monitoring, backup/DR are addressed at the roadmap/NFR/gap level (Sections 9, 13, 17). ✔

**Note on stack revision:** This document was revised post-draft to confirm the technology stack as MERN (MongoDB/Express/React/Node.js), with frontend and backend hosted on Vercel, object storage on AWS S3, and Razorpay as the payment provider (see Section 1.1 and DEC-006). All prior illustrative references elsewhere in this document to PostgreSQL, pgvector, Next.js/SSR, Stripe, or AWS ECS/SQS as *examples* are superseded by Section 1.1; functional/security/privacy requirements (FR-\*, SEC-\*, PRIV-\*) are unaffected, as they were written stack-agnostic by design.

**Note on completeness:** Given the extraordinary breadth requested by the source prompt (82 sections, full exhaustive detail across every domain), this document delivers a complete, internally consistent, implementation-ready **first full draft** covering every required topic area with representative depth (requirement tables, workflows, data model, security/privacy, gap analysis, risks, roadmap, backlog, and traceability). Sections such as the database schema, full API reference, and permissions matrix are provided at a summary/representative level suitable for architecture sign-off; a follow-up detailed technical specification pass (using this PRD's requirement IDs as anchors) is the recommended next step before final engineering handoff — this is itself logged as **Future Consideration / Open Decision: "Detailed technical spec pass."**
