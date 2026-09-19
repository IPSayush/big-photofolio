/**
 * MongoDB / Mongoose connection configuration.
 * Uses MongoDB Atlas (DEC-006).
 * 
 * Connection includes:
 * - Auto-reconnect handling
 * - Structured logging via pino
 * - Graceful shutdown support
 */

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

let isConnected = false;

/**
 * Connect to MongoDB Atlas.
 * Safe to call multiple times — will reuse existing connection.
 */
async function connectDB() {
  if (isConnected) {
    logger.info('MongoDB: reusing existing connection');
    return;
  }

  try {
    const conn = await mongoose.connect(env.mongodbUri, {
      // Mongoose 8 defaults are sensible; explicit options only where needed
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
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
  } catch (err) {
    logger.error({ err }, 'MongoDB: initial connection failed');
    // Fail fast in production; let the process manager restart
    process.exit(1);
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
