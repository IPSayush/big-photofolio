/**
 * Structured logger using pino.
 * NFR-OBS-001: All operations emit structured logs.
 * 
 * Uses pino-pretty in development for readability.
 */

const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  transport:
    env.nodeEnv !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  // Redact sensitive fields from logs
  redact: ['req.headers.authorization', 'password', 'token'],
});

module.exports = logger;
