/**
 * Vercel Serverless Entry Point.
 * 
 * Adapts the Express app for Vercel serverless functions.
 * All /api/* routes are handled by this single function.
 */

const app = require('../packages/server/src/app');

module.exports = app;
