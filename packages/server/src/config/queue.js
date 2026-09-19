/**
 * BullMQ Queue Configuration — producer side.
 * FR-PIPE-001: API server enqueues jobs; worker processes them.
 *
 * In test mode, returns mock queues to avoid Redis dependency in CI.
 */

const { Queue } = require('bullmq');
const env = require('./env');
const logger = require('../utils/logger');

// Shared Redis connection options from existing config
const connectionOpts = {
  connection: {
    host: new URL(env.redisUrl).hostname || 'localhost',
    port: parseInt(new URL(env.redisUrl).port, 10) || 6379,
  },
};

// Queue singletons
const queues = {};

/**
 * Mock queue for test mode — captures jobs without Redis.
 * FR-PIPE-003: Tests can inspect enqueued jobs.
 */
class MockQueue {
  constructor(name) {
    this.name = name;
    this.jobs = [];
  }

  async add(jobName, data, opts) {
    const job = { id: `mock-${Date.now()}-${Math.random()}`, name: jobName, data, opts };
    this.jobs.push(job);
    return job;
  }

  async close() {
    // no-op
  }

  getJobs() {
    return this.jobs;
  }

  clearJobs() {
    this.jobs = [];
  }
}

/**
 * Get or create a named queue.
 * Returns MockQueue in test mode.
 *
 * @param {string} name - Queue name.
 * @returns {Queue|MockQueue}
 */
function getQueue(name) {
  if (queues[name]) return queues[name];

  if (env.nodeEnv === 'test') {
    queues[name] = new MockQueue(name);
    logger.debug({ queue: name }, 'Mock queue created (test mode)');
    return queues[name];
  }

  try {
    queues[name] = new Queue(name, connectionOpts);
    logger.info({ queue: name }, 'BullMQ queue created');
    return queues[name];
  } catch (err) {
    logger.error({ err, queue: name }, 'Failed to create BullMQ queue');
    // Return mock queue as fallback in dev
    queues[name] = new MockQueue(name);
    return queues[name];
  }
}

// Named queue accessors
const QUEUE_NAMES = Object.freeze({
  IMAGE_PROCESSING: 'image-processing',
  FACE_PROCESSING: 'face-processing',
});

/**
 * Get the image processing queue.
 * FR-PIPE-001: Used to enqueue photos for async derivative generation.
 */
function getImageProcessingQueue() {
  return getQueue(QUEUE_NAMES.IMAGE_PROCESSING);
}

/**
 * Get the face processing queue.
 * FR-PIPE-002: Used to enqueue photos for face detection/embedding/matching.
 */
function getFaceProcessingQueue() {
  return getQueue(QUEUE_NAMES.FACE_PROCESSING);
}

module.exports = {
  getQueue,
  getImageProcessingQueue,
  getFaceProcessingQueue,
  MockQueue,
  QUEUE_NAMES,
};
