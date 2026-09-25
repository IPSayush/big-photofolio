/**
 * Vercel Serverless Entry Point.
 * 
 * Adapts the Express app for Vercel serverless functions.
 * All /api/* routes are handled by this single function.
 * 
 * IMPORTANT: Vercel serverless functions don't use server/src/index.js,
 * so we must ensure MongoDB is connected before handling any request.
 * The connectDB() call is idempotent — it reuses the existing connection
 * on warm invocations.
 */

const { connectDB } = require('../packages/server/src/config/db');
const app = require('../packages/server/src/app');

module.exports = async (req, res) => {
  await connectDB();
  app(req, res);
};
