/**
 * Worker Entry Point — BullMQ queue consumers.
 * FR-PIPE-001: All AI/image processing runs asynchronously via queue/worker.
 * NFR-SCALE-001: Workers scale horizontally independent of the web tier.
 *
 * This process runs on an always-on host (Railway/Render), NOT on Vercel.
 * It connects to the same MongoDB and Redis as the API server.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { Worker } = require('bullmq');
const pino = require('pino');
const config = require('./config');
const { connectDB, disconnectDB } = require('./db');
const { processImage } = require('./processors/imageProcessor');
const { processFaces } = require('./processors/faceProcessor');

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

/**
 * Parse Redis URL into host/port for BullMQ connection.
 */
function parseRedisUrl(url) {
  try {
    const parsed = new URL(url);
    const opts = {
      host: parsed.hostname || 'localhost',
      port: parseInt(parsed.port, 10) || 6379,
      maxRetriesPerRequest: null, // Required by BullMQ
    };
    if (parsed.password) opts.password = decodeURIComponent(parsed.password);
    if (parsed.username && parsed.username !== 'default') opts.username = parsed.username;
    if (parsed.protocol === 'rediss:') opts.tls = {};
    return opts;
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null };
  }
}

/**
 * Start the worker.
 */
async function start() {
  logger.info('PhotoFolio Worker starting...');

  // Connect to MongoDB
  await connectDB(config.mongodbUri);

  // Create BullMQ Worker — FR-PIPE-001
  const redisConnection = parseRedisUrl(config.redisUrl);

  worker = new Worker(
    'image-processing',
    async (job) => {
      return processImage(job);
    },
    {
      connection: redisConnection,
      concurrency: config.concurrency,
      // NFR-REL-001: Stalled jobs are retried
      lockDuration: 120000, // 2 min lock per job
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

  // Create BullMQ Worker for face processing — FR-PIPE-002 (face stages)
  faceWorker = new Worker(
    'face-processing',
    async (job) => {
      return processFaces(job);
    },
    {
      connection: redisConnection,
      concurrency: config.concurrency,
      lockDuration: 180000, // 3 min lock (face processing may take longer)
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

  logger.info(
    { concurrency: config.concurrency, queues: ['image-processing', 'face-processing'] },
    'Worker ready — listening for processing jobs'
  );
}

/**
 * Graceful shutdown.
 */
async function shutdown(signal) {
  logger.info({ signal }, 'Worker shutting down...');

  if (worker) {
    await worker.close();
    logger.info('Image processing worker closed');
  }

  if (faceWorker) {
    await faceWorker.close();
    logger.info('Face processing worker closed');
  }

  await disconnectDB();
  process.exit(0);
}

// Graceful shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Unhandled errors
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled rejection');
});

// Start
start().catch((err) => {
  logger.fatal({ err }, 'Worker failed to start');
  process.exit(1);
});
