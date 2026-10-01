/**
 * BullMQ Queue Configuration - producer side.
 * FR-PIPE-001: API server enqueues jobs; worker processes them.
 *
 * In test mode, returns mock queues to avoid Redis dependency in CI.
 */

const { Queue } = require('bullmq');
const env = require('./env');
const logger = require('../utils/logger');

/**
 * Parse Redis URL into ioredis-compatible connection options.
 * Handles redis:// and rediss:// (TLS) URLs.
 * FIX: Added family:4 to force IPv4 (prevents ECONNREFUSED ::1:6379).
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
      family: 4, // Force IPv4 - prevents ::1 (IPv6) resolution issues
    };
    if (parsed.password) opts.password = decodeURIComponent(parsed.password);
    if (parsed.username && parsed.username !== 'default') opts.username = parsed.username;

    // Enable TLS if protocol is rediss:// OR if host is a known cloud Redis provider
    const isCloudRedis = host.includes('upstash.io') || host.includes('redis.cloud') || host.includes('redislabs.com');
    if (parsed.protocol === 'rediss:' || isCloudRedis) {
      opts.tls = {};
    }

    return opts;
  } catch {
    return { host: 'localhost', port: 6379, maxRetriesPerRequest: null, family: 4 };
  }
}

// Queue singletons
const queues = {};

/**
 * Mock queue for test mode - captures jobs without Redis.
 * FR-PIPE-003: Tests can inspect enqueued jobs.
 */
class MockQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
  }

  async add(jobName, data, opts) {
    const job = { id: 'mock-' + Date.now() + '-' + Math.random(), name: jobName, data, opts };
    this.jobs.push(job);
    return job;
  }

  async close() { /* no-op */ }
  getJobs() { return this.jobs; }
  clearJobs() { this.jobs = []; }
}

/**
 * Get or create a named queue.
 * Returns MockQueue in test mode.
 */
function getQueue(name) {
  if (queues[name]) return queues[name];

  if (env.nodeEnv === 'test') {
    queues[name] = new MockQueue(name);
    logger.debug({ queue: name }, 'Mock queue created (test mode)');
    return queues[name];
  }

  try {
    const connection = parseRedisUrl(env.redisUrl);
    queues[name] = new Queue(name, { connection });
    logger.info({ queue: name, host: connection.host, tls: !!connection.tls }, 'BullMQ queue created');
    return queues[name];
  } catch (err) {
    logger.error({ err, queue: name }, 'Failed to create BullMQ queue');
    queues[name] = new MockQueue(name);
    return queues[name];
  }
}

const QUEUE_NAMES = Object.freeze({
  IMAGE_PROCESSING: 'image-processing',
  FACE_PROCESSING: 'face-processing',
  EVENT_DELETE: 'event-delete',     // FR-EVENT-007: async cascade delete
});

function getImageProcessingQueue() { return getQueue(QUEUE_NAMES.IMAGE_PROCESSING); }
function getFaceProcessingQueue() { return getQueue(QUEUE_NAMES.FACE_PROCESSING); }
function getEventDeleteQueue() { return getQueue(QUEUE_NAMES.EVENT_DELETE); }

module.exports = {
  getQueue,
  getImageProcessingQueue,
  getFaceProcessingQueue,
  getEventDeleteQueue,
  MockQueue,
  QUEUE_NAMES,
};
