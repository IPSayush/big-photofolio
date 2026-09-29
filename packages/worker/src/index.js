/**
 * Worker Entry Point - BullMQ queue consumers.
 * FR-PIPE-001: All AI/image processing runs asynchronously via queue/worker.
 * NFR-SCALE-001: Workers scale horizontally independent of the web tier.
 *
 * This process runs on an always-on host (Railway/Render), NOT on Vercel.
 * It connects to the same MongoDB and Redis as the API server.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load env from project root (does NOT override existing env vars)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { Worker } = require('bullmq');
const pino = require('pino');
const config = require('./config');
const { connectDB, disconnectDB } = require('./db');
const { processImage } = require('./processors/imageProcessor');
const { processFaces } = require('./processors/faceProcessor');
const { processEventDelete } = require('./processors/eventDeleteProcessor');

// Determine if pino-pretty is available
let pinoTransport = undefined;
if (config.nodeEnv !== 'production') {
  try {
    require.resolve('pino-pretty');
    pinoTransport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } };
  } catch {
    // pino-pretty not available in production
  }
}

const logger = pino({
  level: config.nodeEnv === 'production' ? 'info' : 'debug',
  transport: pinoTransport,
});

let worker = null;
let faceWorker = null;
let deleteWorker = null;

/**
 * Parse Redis URL into host/port for BullMQ connection.
 * FIX: Added family:4 to force IPv4 (prevents ECONNREFUSED ::1:6379 on Railway).
 * FIX: Auto-detect TLS for Upstash and other cloud Redis providers.
 */
function parseRedisUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname || 'localhost';
    const opts = {
      host,
      port: parseInt(parsed.port, 10) || 6379,
      maxRetriesPerRequest: null, // Required by BullMQ
      family: 4, // Force IPv4 - prevents ::1 (IPv6 localhost) resolution on Railway/containers
    };
    if (parsed.password) opts.password = decodeURIComponent(parsed.password);
    if (parsed.username && parsed.username !== 'default') opts.username = parsed.username;

    // Enable TLS if protocol is rediss:// OR if host is a known cloud Redis provider
    const isCloudRedis = host.includes('upstash.io') || host.includes('redis.cloud') || host.includes('redislabs.com');
    if (parsed.protocol === 'rediss:' || isCloudRedis) {
      opts.tls = {};
    }

    return opts;
  } catch (err) {
    console.error('Failed to parse Redis URL:', err.message);
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null, family: 4 };
  }
}

/**
 * Start the worker.
 */
async function start() {
  // === DEBUG: Log Redis URL resolution so we can verify in Railway deploy logs ===
  const rawRedisUrl = process.env.REDIS_URL;
  logger.info({
    REDIS_URL_SET: !!rawRedisUrl,
    REDIS_URL_SOURCE: rawRedisUrl ? 'environment' : 'fallback (localhost)',
    REDIS_URL_HOST: rawRedisUrl ? (() => { try { return new URL(rawRedisUrl).hostname; } catch { return 'parse-error'; } })() : 'localhost',
    NODE_ENV: process.env.NODE_ENV,
  }, 'PhotoFolio Worker starting - Redis config debug');

  // Connect to MongoDB
  await connectDB(config.mongodbUri);

  // Create BullMQ Worker - FR-PIPE-001
  const redisConnection = parseRedisUrl(config.redisUrl);
  logger.info({
    redisHost: redisConnection.host,
    redisPort: redisConnection.port,
    redisTLS: !!redisConnection.tls,
    redisFamily: redisConnection.family,
    redisHasPassword: !!redisConnection.password,
  }, 'Redis connection config resolved');

  worker = new Worker(
    'image-processing',
    async (job) => {
      return processImage(job);
    },
    {
      connection: redisConnection,
      concurrency: config.concurrency,
      lockDuration: 120000,
      stalledInterval: 60000,
    }
  );

  worker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, photoId: job.data.photoId, durationMs: result?.durationMs },
      'Image job completed'
    );
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, photoId: job?.data?.photoId, error: err.message, attempts: job?.attemptsMade },
      'Image job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Image worker error');
  });

  faceWorker = new Worker(
    'face-processing',
    async (job) => {
      return processFaces(job);
    },
    {
      connection: redisConnection,
      concurrency: config.concurrency,
      lockDuration: 180000,
      stalledInterval: 90000,
    }
  );

  faceWorker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, photoId: job.data.photoId, facesDetected: result?.facesDetected, matchesCreated: result?.matchesCreated },
      'Face job completed'
    );
  });

  faceWorker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, photoId: job?.data?.photoId, error: err.message, attempts: job?.attemptsMade },
      'Face job failed'
    );
  });

  faceWorker.on('error', (err) => {
    logger.error({ err }, 'Face worker error');
  });

  deleteWorker = new Worker(
    'event-delete',
    async (job) => {
      return processEventDelete(job);
    },
    {
      connection: redisConnection,
      concurrency: 1,
      lockDuration: 600000,
      stalledInterval: 300000,
    }
  );

  deleteWorker.on('completed', (job, result) => {
    logger.info(
      { jobId: job.id, eventId: job.data.eventId, durationMs: result?.durationMs, summary: result },
      'Event delete job completed'
    );
  });

  deleteWorker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, eventId: job?.data?.eventId, error: err.message, attempts: job?.attemptsMade },
      'Event delete job failed'
    );
  });

  deleteWorker.on('error', (err) => {
    logger.error({ err }, 'Event delete worker error');
  });

  logger.info(
    { concurrency: config.concurrency, queues: ['image-processing', 'face-processing', 'event-delete'] },
    'Worker ready - listening for processing jobs'
  );
}

async function shutdown(signal) {
  logger.info({ signal }, 'Worker shutting down...');
  if (worker) { await worker.close(); logger.info('Image processing worker closed'); }
  if (faceWorker) { await faceWorker.close(); logger.info('Face processing worker closed'); }
  if (deleteWorker) { await deleteWorker.close(); logger.info('Event delete worker closed'); }
  await disconnectDB();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => { logger.error({ err }, 'Unhandled rejection'); });

start().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
