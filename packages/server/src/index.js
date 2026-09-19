/**
 * Server Entry Point.
 * 
 * Connects to MongoDB, then starts the Express server.
 * Handles graceful shutdown for database connections.
 */

const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const env = require('./config/env');
const logger = require('./utils/logger');

async function startServer() {
  // Connect to MongoDB Atlas
  await connectDB();

  const server = app.listen(env.port, () => {
    logger.info(
      { port: env.port, env: env.nodeEnv },
      `PhotoFolio API server running on port ${env.port}`
    );
  });

  // --- Graceful shutdown ---
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      await disconnectDB();
      logger.info('Server shut down gracefully');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
}

startServer().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
