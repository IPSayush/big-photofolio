/**
 * Auth Controller ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â thin HTTP layer for auth operations.
 * 
 * Controllers handle request/response concerns only.
 * All business logic is in auth.service.js.
 * 
 * Routes: /api/auth/*
 */

const authService = require('../services/auth.service');
const Tenant = require('../models/Tenant');
const logger = require('../utils/logger');

/**
 * POST /api/auth/register
 * FR-AUTH-001: Photographer registration.
 */
async function register(req, res, next) {
  try {
    const result = await authService.register(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // TODO: Send verification email via notification service (GAP-010)
    // For now, log the verification token in development
    if (process.env.NODE_ENV === 'development') {
      logger.info(
        { verificationToken: result.emailVerificationToken },
        'DEV ONLY: Email verification token'
      );
    }

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      data: {
        user: result.user,
        tenant: result.tenant,
        tokens: result.tokens,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 * FR-AUTH-002: Login.
 */
async function login(req, res, next) {
  try {
    const result = await authService.login(req.body, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    // Fetch tenant so frontend has it immediately after login (matches register response shape)
    let tenant = null;
    if (result.user.tenantId) {
      const tenantDoc = await Tenant.findById(result.user.tenantId);
      tenant = tenantDoc?.toJSON() || null;
    }

    res.status(200).json({
      success: true,
      message: 'Login successful.',
      data: {
        user: result.user,
        tenant,
        tokens: result.tokens,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/refresh
 * FR-AUTH-005: Refresh expired access token.
 */
async function refreshToken(req, res, next) {
  try {
    const tokens = await authService.refreshAccessToken(req.body.refreshToken);

    res.status(200).json({
      success: true,
      data: { tokens },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/logout
 * Invalidate refresh token.
 */
async function logout(req, res, next) {
  try {
    await authService.logout(req.user.userId);

    res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/verify-email/:token
 * FR-AUTH-002: Email verification.
 */
async function verifyEmail(req, res, next) {
  try {
    const result = await authService.verifyEmail(req.params.token);

    res.status(200).json({
      success: true,
      message: 'Email verified successfully.',
      data: { user: result.user },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/forgot-password
 * FR-AUTH-002: Initiate password reset.
 */
async function forgotPassword(req, res, next) {
  try {
    const result = await authService.forgotPassword(req.body.email);

    // TODO: Send reset email via notification service (GAP-010)
    if (process.env.NODE_ENV === 'development' && result.resetToken) {
      logger.info(
        { resetToken: result.resetToken },
        'DEV ONLY: Password reset token'
      );
    }

    // Always return success to prevent email enumeration
    res.status(200).json({
      success: true,
      message: 'If an account with this email exists, a password reset link has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/reset-password
 * FR-AUTH-002: Reset password with token.
 */
async function resetPassword(req, res, next) {
  try {
    await authService.resetPassword(req.body.token, req.body.password);

    res.status(200).json({
      success: true,
      message: 'Password reset successful. Please log in with your new password.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/auth/me
 * Get current authenticated user's profile.
 */
async function getMe(req, res, next) {
  try {
    const result = await authService.getCurrentUser(req.user.userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/avatar/presign
 * Generate presigned URL for avatar upload to S3.
 */
async function getAvatarPresignUrl(req, res, next) {
  try {
    const { generatePresignedPutUrl } = require('../utils/s3');
    const env = require('../config/env');
    const userId = req.user.userId;
    const contentType = req.body.contentType || 'image/jpeg';

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(contentType)) {
      return res.status(400).json({ error: 'Invalid content type. Use JPEG, PNG, or WebP.' });
    }

    const ext = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1];
    const key = `avatars/${userId}.${ext}`;
    const bucket = env.aws.s3BucketOriginals;

    const uploadUrl = await generatePresignedPutUrl(bucket, key, contentType, 300);

    res.status(200).json({
      success: true,
      data: { uploadUrl, key, bucket },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/avatar
 * Update user's avatar URL after successful S3 upload.
 */
async function updateAvatar(req, res, next) {
  try {
    const User = require('../models/User');
    const { generatePresignedGetUrl } = require('../utils/s3');
    const env = require('../config/env');
    const userId = req.user.userId;
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({ error: 'S3 key is required.' });
    }

    // Build a public-ish URL (or we can generate signed URLs on demand)
    const avatarUrl = `https://${env.aws.s3BucketOriginals}.s3.${env.aws.region}.amazonaws.com/${key}`;

    const user = await User.findByIdAndUpdate(
      userId,
      { avatarUrl },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Avatar updated successfully.',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/auth/profile
 * Update user's name.
 */
async function updateUserProfile(req, res, next) {
  try {
    const User = require('../models/User');
    const userId = req.user.userId;
    const { firstName, lastName } = req.body;

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Provide at least firstName or lastName.' });
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated.',
      data: { user },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getMe,
};
