/**
 * MongoDB / Mongoose connection configuration.
 * Uses MongoDB Atlas (DEC-006).
 * 
 * Connection includes:
 * - Auto-reconnect handling
 * - Structured logging via pino
 * - Graceful shutdown support
 * - Serverless-safe: no process.exit() — throws instead
 */

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

let isConnected = false;

/**
 * Connect to MongoDB Atlas.
 * Safe to call multiple times — will reuse existing connection.
 * Serverless-safe: throws on failure instead of process.exit().
 */
async function connectDB(retries = 3) {
  if (isConnected) {
    logger.debug('MongoDB: reusing existing connection');
    return;
  }

  // Also reuse if mongoose already has an active connection (warm serverless invocation)
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    logger.debug('MongoDB: reusing mongoose connection (warm invocation)');
    return;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(env.mongodbUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });

      isConnected = true;
      logger.info({ host: conn.connection.host }, 'MongoDB: connected to Atlas');

      mongoose.connection.on('error', (err) => {
        logger.error({ err }, 'MongoDB: connection error');
      });

      mongoose.connection.on('disconnected', () => {
        isConnected = false;
        logger.warn('MongoDB: disconnected');
      });

      return;
    } catch (err) {
      const isLastAttempt = attempt === retries;
      const isWhitelistError = err.message?.includes('whitelist') || err.message?.includes('IP');

      if (isWhitelistError) {
        logger.error(
          'MongoDB: IP NOT WHITELISTED. Go to MongoDB Atlas > Network Access > Add Current IP Address.'
        );
      }

      logger.error(
        { err: err.message, attempt, maxRetries: retries },
        `MongoDB: connection attempt ${attempt}/${retries} failed`
      );

      if (isLastAttempt) {
        logger.fatal('MongoDB: all connection attempts failed.');
        // Serverless-safe: throw instead of process.exit(1)
        // so the request gets a proper 500 error response
        throw new Error('MongoDB connection failed after all retries');
      }

      const delay = Math.pow(2, attempt) * 1000;
      logger.info({ delayMs: delay }, `MongoDB: retrying in ${delay / 1000}s...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Graceful disconnect — called during shutdown.
 */
async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  logger.info('MongoDB: disconnected gracefully');
}

module.exports = { connectDB, disconnectDB };
