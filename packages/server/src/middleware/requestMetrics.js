/**
 * Request Metrics Middleware — NFR-OBS-001.
 * 
 * Tracks response time and status code for every request.
 * Logs slow requests (>2s) as warnings for performance monitoring.
 */

const logger = require('../utils/logger');

const SLOW_THRESHOLD_MS = 2000;

function requestMetrics(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - start;
    const durationMs = Number(durationNs / 1_000_000n);

    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      durationMs,
      correlationId: req.correlationId,
      userAgent: req.headers['user-agent']?.substring(0, 100),
    };

    if (durationMs > SLOW_THRESHOLD_MS) {
      logger.warn(logData, 'Slow request detected');
    } else if (res.statusCode >= 500) {
      logger.error(logData, 'Server error response');
    } else if (res.statusCode >= 400) {
      // Already logged by errorHandler, skip
    }
  });

  next();
}

module.exports = { requestMetrics };
