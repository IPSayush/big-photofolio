# Worker service — always-on host for BullMQ queue consumers
# FR-PIPE-001: Async processing cannot run on Vercel serverless
FROM node:18-alpine

WORKDIR /app

# Copy root package.json and workspace configs
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/worker/package.json packages/worker/

# Install dependencies
RUN npm install --workspace=packages/worker --workspace=packages/shared

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/worker/ packages/worker/

# Run as non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

CMD ["node", "packages/worker/src/index.js"]
