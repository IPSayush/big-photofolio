/**
 * Redis connection configuration.
 * Used for: rate limiting (SEC-008).
 * BullMQ queues use their own connections via queue.js.
 *
 * Uses ioredis for robust reconnection and Vercel serverless compatibility.
 */

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Get or create a Redis client singleton for rate limiting.
 * Returns null if Redis is unavailable (degrades gracefully to in-memory).
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 3, // Rate limiter needs a finite number
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: true,
      enableOfflineQueue: false,
    });

    redisClient.on('connect', () => {
      logger.info('Redis: connected (rate limiting)');
    });

    redisClient.on('error', (err) => {
      logger.error({ err: err.message }, 'Redis: connection error');
    });

    return redisClient;
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis: failed to create client — rate limiting will use in-memory fallback');
    return null;
  }
}

module.exports = { getRedisClient };
