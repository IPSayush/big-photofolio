# PhotoFolio — AI-Powered Event Photography Platform

A multi-tenant SaaS platform that lets photographers deliver AI-personalized event galleries to guests via face-matching.

## 🏗️ Architecture

```
┌─ Vercel ────────────────────────────────┐
│  React Client (CDN)  │  Express API (λ) │
└──────────────────────┴──────────────────┘
         │                      │
    ┌────┴───┐            ┌─────┴─────┐
    │MongoDB │            │   Redis   │
    │ Atlas  │            │ (Upstash) │
    └────────┘            └─────┬─────┘
         │                      │
    ┌────┴───┐            ┌─────┴─────┐
    │AWS S3  │            │  Worker   │
    │+ CDN   │            │(BullMQ)  │
    └────────┘            └───────────┘
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| `packages/server` | Express API — auth, events, uploads, billing, monitoring |
| `packages/client` | React (Vite) frontend — photographer + guest + admin UI |
| `packages/worker` | BullMQ queue consumers — image processing + face matching |
| `packages/shared` | Shared constants, enums, and validation schemas |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or Upstash)

### Setup

```bash
# Clone and install
git clone <repo-url>
cd photofolio
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your credentials

# Start databases (Docker)
docker-compose up -d mongodb redis

# Start all services
npm run dev --workspace=packages/server    # API on :5000
npm run dev --workspace=packages/client    # Frontend on :5173
npm run dev --workspace=packages/worker    # Worker
```

### Run Tests

```bash
cd packages/server
npx vitest run --reporter=verbose
# 109 tests across 8 test files
```

## 🔑 Key Features

### For Photographers
- 📸 **Event Management** — Create events with dual QR codes (browse + AI match)
- 📤 **Bulk Upload** — Drag-and-drop photo uploads to S3 with progress tracking
- 📊 **Dashboard** — Per-event stats, quota monitoring, storage usage
- 💳 **Subscription** — Razorpay-integrated billing with plan management

### For Guests
- 🤳 **Selfie Upload** — Take/upload a selfie with consent flow
- 🤖 **AI Matching** — Face detection + vector similarity matching
- 🖼️ **Personal Gallery** — View and download matched photos
- 🔒 **Privacy-First** — Explicit consent, event-scoped processing only

### For Admins
- 🛡️ **Tenant Management** — Suspend/reinstate tenants and events
- 📈 **Platform Metrics** — Total users, events, photos, plan distribution
- ⚙️ **Plan Config** — Configurable quotas, no code changes needed

## 🔒 Security

- JWT auth with refresh token rotation
- Tenant-scoped data isolation (SEC-001/002)
- Rate limiting on all endpoints
- Pre-signed S3 URLs (no public access)
- Audit logging for admin actions
- Request correlation IDs for tracing

## 📁 Project Structure

```
├── .github/workflows/ci.yml    # CI/CD pipeline
├── api/index.js                # Vercel serverless entry
├── docker-compose.yml          # Local dev databases
├── vercel.json                 # Vercel deployment config
├── docs/
│   └── DEPLOYMENT.md           # Production deployment guide
└── packages/
    ├── client/                 # React frontend
    │   ├── src/
    │   │   ├── api/            # API client + interceptors
    │   │   ├── components/     # UI primitives + layouts
    │   │   ├── context/        # Auth state management
    │   │   ├── hooks/          # Custom React hooks
    │   │   └── pages/          # Route pages
    │   └── vite.config.js
    ├── server/                 # Express API
    │   ├── src/
    │   │   ├── config/         # Environment + validation
    │   │   ├── controllers/    # Route handlers
    │   │   ├── middleware/     # Auth, tenant, quota, security
    │   │   ├── models/         # Mongoose schemas
    │   │   ├── routes/         # Express routers
    │   │   ├── services/       # Business logic
    │   │   └── utils/          # Logger, helpers
    │   └── tests/              # Integration tests (109)
    ├── shared/                 # Cross-package constants
    └── worker/                 # BullMQ consumers
        ├── src/
        │   ├── processors/     # Image + face processing
        │   └── providers/      # Face detection abstraction
        └── Dockerfile
```

## 📋 Test Coverage

| Test File | Tests | Coverage |
|-----------|-------|----------|
| auth.test.js | 17 | Registration, login, JWT, tenant isolation |
| profile.test.js | 9 | CRUD, branding, audit logging |
| event.test.js | 17 | CRUD, QR generation, tenant scoping |
| upload.test.js | 22 | Pre-signed URLs, quota enforcement, confirmation |
| face.test.js | 10 | Face indexing, matching, event scoping |
| guest.test.js | 15 | Consent, selfie, gallery delivery |
| subscription.test.js | 11 | Plans, subscribe, cancel, webhooks |
| dashboard.test.js | 8 | Photographer + admin dashboards, suspend/reinstate |
| **Total** | **109** | **All passing ✅** |

## 📄 License

Private — All rights reserved.
