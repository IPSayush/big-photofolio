/**
 * Worker MongoDB Connection.
 * Connects to the same Atlas instance as the API server.
 */

const mongoose = require('mongoose');
const pino = require('pino');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport:
    process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});

/**
 * Connect to MongoDB.
 * @param {string} uri - MongoDB connection URI.
 */
async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI is required for the worker');
  }

  try {
    await mongoose.connect(uri);
    const dbName = mongoose.connection.db ? mongoose.connection.db.databaseName : 'UNKNOWN';
    const host = mongoose.connection.host || 'UNKNOWN';
    logger.info({
      dbName,
      host,
      readyState: mongoose.connection.readyState,
      uriDbName: uri.split('/').pop()?.split('?')[0] || 'UNKNOWN',
    }, 'Worker: MongoDB connected - DEBUG connection details');
  } catch (err) {
    logger.error({ err }, 'Worker: MongoDB connection failed');
    throw err;
  }
}

/**
 * Disconnect from MongoDB.
 */
async function disconnectDB() {
  await mongoose.disconnect();
  logger.info('Worker: MongoDB disconnected');
}

module.exports = { connectDB, disconnectDB };

