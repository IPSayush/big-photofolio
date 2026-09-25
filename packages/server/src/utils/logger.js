/**
 * Structured logger using pino.
 * NFR-OBS-001: All operations emit structured logs.
 * 
 * Uses pino-pretty in development for readability (if available).
 * Falls back to standard JSON logging in production or when pino-pretty is not installed.
 */

const pino = require('pino');
const env = require('../config/env');

// Determine if pino-pretty is available (it is a devDependency, not available in production)
let transport = undefined;
if (env.nodeEnv !== 'production') {
  try {
    require.resolve('pino-pretty');
    transport = { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } };
  } catch {
    // pino-pretty not available (e.g. serverless environment with no devDependencies)
  }
}

const logger = pino({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  transport,
  // Redact sensitive fields from logs
  redact: ['req.headers.authorization', 'password', 'token'],
});

module.exports = logger;
