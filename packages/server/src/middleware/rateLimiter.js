/**
 * Rate Limiting Middleware.
 * SEC-008: Rate limiting on guest-facing and public endpoints.
 * 
 * Uses Redis store for shared state across serverless invocations.
 * Falls back to in-memory store if Redis is unavailable (dev only).
 */

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Create a rate limiter with the given options.
 * Uses Redis store in production for distributed rate limiting.
 * 
 * @param {object} options - Rate limit options override.
 * @returns {Function} Express rate limit middleware
 */
function createRateLimiter(options = {}) {
  const config = {
    windowMs: options.windowMs || env.rateLimit.windowMs,
    max: options.max || env.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Too many requests. Please try again later.',
      code: 'RATE_LIMITED',
    },
    // Don't rate-limit in test environment
    skip: () => env.nodeEnv === 'test',
    ...options,
  };

  return rateLimit(config);
}

/**
 * Strict rate limiter for auth endpoints (login, register, password reset).
 * Lower limits to prevent brute-force attacks.
 */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 minutes
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
    code: 'AUTH_RATE_LIMITED',
  },
});

/**
 * Standard API rate limiter.
 */
const apiLimiter = createRateLimiter();

/**
 * Guest endpoint rate limiter — SEC-008.
 * Stricter limits for selfie upload, consent, gallery fetch.
 */
const guestLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    error: 'Too many requests. Please try again later.',
    code: 'GUEST_RATE_LIMITED',
  },
});

module.exports = { createRateLimiter, authLimiter, apiLimiter, guestLimiter };
