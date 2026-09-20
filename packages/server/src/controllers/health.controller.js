/**
 * Deep Health Check — NFR-OBS-001.
 * 
 * Verifies connectivity to all external dependencies:
 * - MongoDB (database ping)
 * - Redis (queue backend ping)
 * 
 * Used by deployment pipelines and monitoring dashboards.
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * GET /api/health/deep — detailed dependency health check.
 */
async function deepHealthCheck(req, res) {
  const checks = {};
  let healthy = true;
  const start = Date.now();

  // MongoDB
  try {
    const mongoState = mongoose.connection.readyState;
    if (mongoState === 1) {
      await mongoose.connection.db.admin().ping();
      checks.mongodb = { status: 'healthy', latencyMs: Date.now() - start };
    } else {
      checks.mongodb = { status: 'unhealthy', state: mongoState };
      healthy = false;
    }
  } catch (err) {
    checks.mongodb = { status: 'unhealthy', error: err.message };
    healthy = false;
  }

  // Redis (via ioredis if available, otherwise skip)
  try {
    const Redis = require('ioredis');
    const env = require('../config/env');
    if (env.redisUrl) {
      const redisStart = Date.now();
      const redis = new Redis(env.redisUrl, { 
        connectTimeout: 3000,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await redis.connect();
      await redis.ping();
      checks.redis = { status: 'healthy', latencyMs: Date.now() - redisStart };
      await redis.quit();
    } else {
      checks.redis = { status: 'skipped', reason: 'No REDIS_URL configured' };
    }
  } catch (err) {
    checks.redis = { status: 'unhealthy', error: err.message };
    // Redis being down is degraded, not unhealthy (API still works, just no async)
  }

  // Memory usage
  const mem = process.memoryUsage();
  checks.memory = {
    heapUsedMB: Math.round(mem.heapUsed / 1048576),
    heapTotalMB: Math.round(mem.heapTotal / 1048576),
    rssMB: Math.round(mem.rss / 1048576),
  };

  // Uptime
  checks.uptime = {
    seconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
  };

  const status = healthy ? 200 : 503;
  res.status(status).json({
    success: healthy,
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
    checks,
  });

  if (!healthy) {
    logger.warn({ checks }, 'Deep health check detected unhealthy dependency');
  }
}

module.exports = { deepHealthCheck };
