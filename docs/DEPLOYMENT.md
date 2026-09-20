# PhotoFolio — Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────┐
│         Vercel (Edge)           │
│  ┌──────────┐  ┌─────────────┐ │
│  │  React   │  │  Express    │ │
│  │  Client  │  │  API (λ)    │ │
│  │  (CDN)   │  │  /api/*     │ │
│  └──────────┘  └─────────────┘ │
└─────────────────────────────────┘
         │               │
         ▼               ▼
┌──────────────┐  ┌─────────────┐
│  MongoDB     │  │  Redis      │
│  Atlas       │  │  (Upstash)  │
└──────────────┘  └─────────────┘
         │               │
         ▼               ▼
┌──────────────┐  ┌─────────────┐
│  AWS S3      │  │  Worker     │
│  CloudFront  │  │  (Railway/  │
│  (CDN)       │  │   Render)   │
└──────────────┘  └─────────────┘
```

## Prerequisites

1. **MongoDB Atlas** — create a cluster at [mongodb.com/cloud/atlas](https://mongodb.com/cloud/atlas)
2. **Redis** — use [Upstash](https://upstash.com) for serverless Redis, or Redis Cloud
3. **AWS S3** — create two private buckets (originals, derivatives)
4. **AWS CloudFront** — distribution pointing to derivatives bucket
5. **Razorpay** — merchant account for billing
6. **Vercel** — account for frontend + API deployment
7. **Railway/Render** — account for always-on worker service

## Environment Variables

### Vercel (API + Client)

Set these in Vercel project settings → Environment Variables:

```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/photofolio
REDIS_URL=redis://default:<pass>@<host>:6379
JWT_SECRET=<random-64-char-string>
JWT_REFRESH_SECRET=<random-64-char-string>
CLIENT_URL=https://your-app.vercel.app
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET_ORIGINALS=photofolio-originals
S3_BUCKET_DERIVATIVES=photofolio-derivatives
CLOUDFRONT_DOMAIN=https://dxxxxx.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=KXXXXXX
CLOUDFRONT_PRIVATE_KEY_PATH=./cloudfront-private-key.pem
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

### Worker (Railway/Render)

Same MongoDB, Redis, and AWS credentials as above.

## Deployment Steps

### 1. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Link to project
vercel link

# Deploy preview
vercel

# Deploy production
vercel --prod
```

### 2. Deploy Worker

#### Option A: Railway
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and link
railway login
railway link

# Deploy
railway up
```

#### Option B: Docker (any VPS)
```bash
# Build and run
docker-compose up -d worker
```

### 3. Configure Webhooks

- **Razorpay**: Set webhook URL to `https://your-app.vercel.app/api/webhooks/razorpay`
- Events: `subscription.charged`, `subscription.cancelled`, `payment.failed`

### 4. Configure CloudFront

- Create a CloudFront distribution
- Origin: S3 derivatives bucket (OAI access)
- Create a CloudFront key pair for signed URLs
- Upload private key to Vercel and worker environments

## CI/CD Pipeline

The GitHub Actions workflow at `.github/workflows/ci.yml` handles:

1. **On PR**: Lint + test + preview deployment
2. **On merge to main**: Lint + test + production deployment

### Required GitHub Secrets

```
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

## Monitoring

- **Vercel**: Built-in analytics and function logs
- **MongoDB Atlas**: Performance Advisor, alerts
- **Worker**: Container logs (Railway/Render dashboard)
- **AWS CloudWatch**: S3 and CloudFront metrics

## Backup & Recovery

- **MongoDB**: Atlas automated daily backups (retained 7 days on free tier)
- **S3**: Versioning enabled, lifecycle rules for cost optimization
- **Worker**: Stateless — just redeploy from Docker image

## Scaling Notes

- **API**: Vercel auto-scales serverless functions
- **Worker**: Scale horizontally by adding more instances (BullMQ handles distribution)
- **MongoDB**: Atlas auto-scaling or manual tier upgrade
- **Redis**: Upstash serverless scales automatically
