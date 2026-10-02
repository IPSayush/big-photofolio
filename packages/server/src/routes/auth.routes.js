/**
 * Auth Routes — /api/auth
 * FR-AUTH-001/002/005: Registration, login, token refresh, password reset, email verify.
 * SEC-008: Rate limiting on all public auth endpoints via authLimiter.
 * 
 * Public routes: register, login, forgot-password, reset-password, verify-email, refresh
 * Protected routes: logout, me
 */

const express = require('express');
const router = express.Router();

const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} = require('../validators/auth.validators');

// --- Public routes (rate-limited) ---

// FR-AUTH-001: Photographer registration
router.post(
  '/register',
  authLimiter,
  validate(registerSchema, 'body'),
  authController.register
);

// FR-AUTH-002: Login
router.post(
  '/login',
  authLimiter,
  validate(loginSchema, 'body'),
  authController.login
);

// FR-AUTH-002: Request password reset
router.post(
  '/forgot-password',
  authLimiter,
  validate(forgotPasswordSchema, 'body'),
  authController.forgotPassword
);

// FR-AUTH-002: Reset password with token
router.post(
  '/reset-password',
  authLimiter,
  validate(resetPasswordSchema, 'body'),
  authController.resetPassword
);

// FR-AUTH-002: Verify email
router.get(
  '/verify-email/:token',
  authLimiter,
  authController.verifyEmail
);

// FR-AUTH-005: Refresh access token
router.post(
  '/refresh',
  authLimiter,
  validate(refreshTokenSchema, 'body'),
  authController.refreshToken
);

// --- Protected routes ---

// Logout (invalidate refresh token)
router.post(
  '/logout',
  authenticate,
  authController.logout
);

// Get current user profile
router.get(
  '/me',
  authenticate,
  authController.getMe
);

// Avatar presigned URL for upload
router.post(
  '/avatar/presign',
  authenticate,
  authController.getAvatarPresignUrl
);

// Update avatar after S3 upload
router.patch(
  '/avatar',
  authenticate,
  authController.updateAvatar
);

// Update user profile (name)
router.patch(
  '/profile',
  authenticate,
  authController.updateUserProfile
);

module.exports = router;
