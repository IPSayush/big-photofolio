/**
 * Centralized Error Handler Middleware.
 * 
 * Catches all unhandled errors from route handlers and middleware.
 * Returns consistent error response format.
 * Logs errors with structured context (NFR-OBS-001).
 */

const logger = require('../utils/logger');
const env = require('../config/env');

/**
 * Application-level error class with status code and error code.
 */
class AppError extends Error {
  /**
   * @param {string} message - Human-readable error message.
   * @param {number} statusCode - HTTP status code.
   * @param {string} [code] - Machine-readable error code.
   */
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Express error-handling middleware (must have 4 params).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // Default to 500
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let code = err.code || 'INTERNAL_ERROR';

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(statusCode).json({
      success: false,
      error: 'Validation failed.',
      code,
      details,
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0] || 'unknown';
    message = `A record with this ${field} already exists.`;
  }

  // Mongoose cast error (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // JWT errors (fallback — primary handling is in auth middleware)
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid token.';
  }

  // Log all server errors
  if (statusCode >= 500) {
    logger.error(
      {
        err,
        method: req.method,
        url: req.originalUrl,
        userId: req.user?.userId,
        tenantId: req.tenantId,
      },
      'Unhandled server error'
    );
  } else {
    logger.warn(
      {
        statusCode,
        code,
        message,
        method: req.method,
        url: req.originalUrl,
      },
      'Client error response'
    );
  }

  // Never leak stack traces in production
  const response = {
    success: false,
    error: message,
    code,
  };

  if (env.nodeEnv === 'development' && statusCode >= 500) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = { AppError, errorHandler };
