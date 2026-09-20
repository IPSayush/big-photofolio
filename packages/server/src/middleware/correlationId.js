/**
 * Request Correlation Middleware — NFR-OBS-001.
 * 
 * Assigns a unique correlation ID to each request for distributed tracing.
 * The ID is available on req.correlationId and returned in the X-Correlation-ID header.
 */

const crypto = require('crypto');

function correlationId(req, res, next) {
  const id = req.headers['x-correlation-id'] || crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}

module.exports = { correlationId };
