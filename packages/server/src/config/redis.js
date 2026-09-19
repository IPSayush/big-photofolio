/**
 * Redis connection configuration.
 * Used for: rate limiting (SEC-008), BullMQ job queues (FR-PIPE-001).
 * 
 * Uses ioredis for robust reconnection and Vercel serverless compatibility.
 */

const Redis = require('ioredis');
const env = require('./env');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Get or create a Redis client singleton.
 * Returns null if Redis is unavailable (degrades gracefully in dev).
 */
function getRedisClient() {
  if (redisClient) return redisClient;

  try {
    redisClient = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      logger.info('Redis: connected');
    });

    redisClient.on('error', (err) => {
      logger.error({ err }, 'Redis: connection error');
    });

    return redisClient;
  } catch (err) {
    logger.warn({ err }, 'Redis: failed to create client — rate limiting will use in-memory fallback');
    return null;
  }
}

module.exports = { getRedisClient };
