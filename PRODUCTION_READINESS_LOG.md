# Production Readiness Log

| Area | Issue Found | Root Cause | Fix Applied | Verified? | Commit |
|------|------------|------------|-------------|-----------|--------|
| A-Build | Vercel build fails: vite not found | vite in devDependencies, Vercel skips devDeps | Moved vite + @vitejs/plugin-react to dependencies | Locally YES | 0da3a6f |
| A-Build | Build uses npx vite (downloads random version) | Root build script uses npx | Changed to npm run build --workspace=packages/client | Locally YES | 0da3a6f |
| A-Build | Mongoose duplicate schema index warnings (16 models) | Fields have both index:true and schema.index() | Removed index:true, kept compound schema.index() | Locally YES | 0da3a6f |
| B-Vercel | FUNCTION_INVOCATION_FAILED on all API calls | connectDB() not called in api/index.js | Added await connectDB() before app(req,res) | Locally YES | prev commit |
| B-Vercel | db.js calls process.exit(1) killing serverless | process.exit in serverless = instant death | Replaced with throw Error | Locally YES | prev commit |
| B-Vercel | pino-pretty crashes in production | pino-pretty is devDep, loaded unconditionally | try/require.resolve guard | Locally YES | prev commit |
| B-Vercel | includeFiles didn't include packages/shared | @photofolio/shared workspace package missing | Added packages/shared to includeFiles glob | Locally YES | prev commit |
| B-Vercel | Login blank screen - no tenant in response | Login API returns {user,tokens} not {user,tenant,tokens} | Added tenant fetch in login controller | Locally YES | prev commit |
| B-Vercel | No React Error Boundary | Unhandled errors unmount entire tree | Added ErrorBoundary component wrapping App | Locally YES | prev commit |
| B-Vercel | CORS open? | Checked - uses env.clientUrl, not wildcard | No change needed | Verified | 0da3a6f |
| C-Worker | pino-pretty crashes worker in production | Same as server: unconditional require | Added try/require.resolve guard | Locally YES | 0da3a6f |
| C-Worker | BullMQ requires maxRetriesPerRequest:null | Default ioredis value (3) causes BullMQ errors | Set maxRetriesPerRequest:null in Redis opts | Locally YES | 0da3a6f |
| C-Worker | Dockerfile uses alpine, sharp may fail | sharp needs glibc, alpine uses musl | Changed to node:18-slim, added build tools | YES | 0da3a6f |
| C-Worker | Redis password not parsed from URL | parseRedisUrl ignored auth | Added password/username/TLS parsing | YES | 0da3a6f |
| D-DB | queue.js Redis URL parsing fails | No password extraction from URL | Rewrote with proper URL parsing | YES | 0da3a6f |
| F-Security | .env.example contains REAL secrets | Real MongoDB, AWS, Razorpay credentials | Replaced with placeholder values | YES | 0da3a6f |
| F-Security | JWT secrets fallback defaults? | Checked - no fallback in code | No change needed | Verified | 0da3a6f |
| F-Security | Tenant scoping on all routes? | Checked all route files | All protected routes have enforceTenantScope | Verified | N/A |
| F-Security | .env in git history? | Checked git log | Never committed | Verified | N/A |

## Pending Verification (need Vercel deploy + live test)
- [ ] Vercel build succeeds
- [ ] /api/health returns 200
- [ ] Register -> Login -> Dashboard flow works
- [ ] Worker on Railway runs without crash-looping

## Required Vercel Environment Variables
These MUST be set in Vercel Dashboard > Settings > Environment Variables:
- NODE_ENV=production
- MONGODB_URI
- JWT_ACCESS_SECRET
- JWT_REFRESH_SECRET
- CLIENT_URL=https://big-photofolio.vercel.app
- REDIS_URL (Upstash)
- RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
- AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
- S3_BUCKET_ORIGINALS, S3_BUCKET_DERIVATIVES
