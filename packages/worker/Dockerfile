# Worker service — always-on host for BullMQ queue consumers
# FR-PIPE-001: Async processing cannot run on Vercel serverless
FROM node:18-slim

# Install system deps needed by sharp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package.json and workspace configs first (for layer caching)
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/

# Install production dependencies only
RUN npm install --workspace=packages/worker --workspace=packages/shared --omit=dev

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/worker/ packages/worker/

# Run as non-root user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
USER appuser

CMD ["node", "packages/worker/src/index.js"]
