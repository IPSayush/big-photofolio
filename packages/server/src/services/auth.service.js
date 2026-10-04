/**
 * Auth Service — core authentication business logic.
 * FR-AUTH-001: Registration (email + password, OD-2: no social SSO in MVP).
 * FR-AUTH-002: Login, logout, password reset, email verification.
 * FR-AUTH-005: Short-lived access tokens with refresh support.
 * SEC-007: Auth actions are audit-logged.
 * 
 * This service contains all auth logic. Controllers are thin wrappers
 * that call these methods and return responses.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');
const RetentionPolicy = require('../models/RetentionPolicy');
const env = require('../config/env');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');
const { ROLES, USER_STATUS, TENANT_STATUS } = require('@photofolio/shared');

/**
 * Generate a JWT access token.
 * FR-AUTH-005: Short-lived access tokens.
 */
function generateAccessToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      tenantId: user.tenantId,
      role: user.role,
    },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpiresIn }
  );
}

/**
 * Generate a JWT refresh token.
 * FR-AUTH-005: Refresh token support.
 * Each token includes a unique jti to ensure rotation produces distinct tokens.
 */
function generateRefreshToken(user) {
  return jwt.sign(
    {
      userId: user._id,
      type: 'refresh',
      jti: crypto.randomUUID(), // Unique ID ensures each token is distinct
    },
    env.jwt.refreshSecret,
    { expiresIn: env.jwt.refreshExpiresIn }
  );
}

/**
 * Generate a random hex token for email verification / password reset.
 */
function generateRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a token for secure storage (we don't store raw tokens in DB).
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Register a new photographer account.
 * FR-AUTH-001: Creates User + Tenant + RetentionPolicy in a logical transaction.
 * 
 * @param {object} data - Validated registration data.
 * @param {object} reqMeta - Request metadata (IP, user agent) for audit logging.
 * @returns {object} { user, tenant, tokens }
 */
async function register(data, reqMeta = {}) {
  const { email, password, firstName, lastName, businessName } = data;

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS');
  }

  // Create tenant first (photographer's business entity)
  const tenant = await Tenant.create({
    businessName,
    contactEmail: email,
    status: TENANT_STATUS.ACTIVE,
  });

  // Create default retention policy for the tenant — DEC-004
  await RetentionPolicy.create({
    tenantId: tenant._id,
    // Defaults from DEC-004; overridden by plan defaults when plan is assigned
    faceDataRetentionDays: 90,
    eventPhotoRetentionDays: 365,
    originalPhotoRetentionDays: 365,
  });

  // Generate email verification token
  const verificationToken = generateRandomToken();
  const verificationTokenHash = hashToken(verificationToken);

  // Create user (photographer)
  const user = await User.create({
    tenantId: tenant._id,
    email,
    password, // Hashed by pre-save hook
    firstName,
    lastName,
    role: ROLES.PHOTOGRAPHER,
    status: USER_STATUS.PENDING_VERIFICATION,
    emailVerificationToken: verificationTokenHash,
    emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
  });

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Store hashed refresh token — FR-AUTH-005
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();

  // SEC-007: Audit log
  await AuditLog.create({
    actorId: user._id,
    actorRole: user.role,
    actorEmail: user.email,
    tenantId: tenant._id,
    action: 'user.register',
    targetType: 'User',
    targetId: user._id,
    metadata: { businessName },
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
  });

  logger.info({ userId: user._id, tenantId: tenant._id }, 'User registered successfully');

  // AUTO-SUBSCRIBE to Free Trial plan if one exists
  try {
    const Plan = require('../models/Plan');
    const Subscription = require('../models/Subscription');
    const freePlan = await Plan.findOne({ isActive: true, 'pricing.amount': 0 }).sort({ sortOrder: 1 });
    if (freePlan) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      let trialEnd = null;
      let status = 'active';
      if (freePlan.trialDays > 0) {
        status = 'trialing';
        trialEnd = new Date(now.getTime() + freePlan.trialDays * 86400000);
      }
      await Subscription.create({
        tenantId: tenant._id,
        planId: freePlan._id,
        status,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEnd,
      });
      // Link plan to tenant
      tenant.planId = freePlan._id;
      await tenant.save();
      logger.info({ tenantId: tenant._id, planId: freePlan._id.toString() }, 'Auto-subscribed to Free Trial');
    }
  } catch (autoSubErr) {
    // Non-fatal: user is registered, just no auto-subscription
    logger.warn({ err: autoSubErr }, 'Auto-subscription to Free Trial failed (non-fatal)');
  }

  return {
    user: user.toJSON(),
    tenant: tenant.toJSON(),
    tokens: {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: env.jwt.accessExpiresIn,
    },
    // Return raw verification token for email sending (not stored raw in DB)
    emailVerificationToken: verificationToken,
  };
}

/**
 * Log in a user with email + password.
 * FR-AUTH-002: Secure login.
 * 
 * @param {object} data - { email, password }
 * @param {object} reqMeta - Request metadata for audit logging.
 * @returns {object} { user, tokens }
 */
async function login(data, reqMeta = {}) {
  const { email, password } = data;

  // Find user with password field included
  const user = await User.findOne({ email }).select('+password +refreshTokenHash');
  if (!user) {
    // Deliberately vague message to prevent email enumeration
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  // Check account status
  if (user.status === USER_STATUS.SUSPENDED) {
    throw new AppError('Account suspended. Please contact support.', 403, 'ACCOUNT_SUSPENDED');
  }
  if (user.status === USER_STATUS.DEACTIVATED) {
    throw new AppError('Account deactivated.', 403, 'ACCOUNT_DEACTIVATED');
  }

  // Generate new tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Update refresh token hash and last login
  user.refreshTokenHash = hashToken(refreshToken);
  user.lastLoginAt = new Date();
  await user.save();

  // SEC-007: Audit log
  await AuditLog.create({
    actorId: user._id,
    actorRole: user.role,
    actorEmail: user.email,
    tenantId: user.tenantId,
    action: 'user.login',
    targetType: 'User',
    targetId: user._id,
    ipAddress: reqMeta.ip,
    userAgent: reqMeta.userAgent,
  });

  logger.info({ userId: user._id }, 'User logged in successfully');

  return {
    user: user.toJSON(),
    tokens: {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: env.jwt.accessExpiresIn,
    },
  };
}

/**
 * Refresh an expired access token using a valid refresh token.
 * FR-AUTH-005: Refresh token flow.
 * 
 * @param {string} refreshToken - The refresh token to validate.
 * @returns {object} { accessToken, refreshToken, accessTokenExpiresIn }
 */
async function refreshAccessToken(refreshToken) {
  // Verify the refresh token
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch (err) {
    throw new AppError('Invalid or expired refresh token.', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (decoded.type !== 'refresh') {
    throw new AppError('Invalid token type.', 401, 'INVALID_TOKEN_TYPE');
  }

  // Find user and verify refresh token hash matches
  const user = await User.findById(decoded.userId).select('+refreshTokenHash');
  if (!user) {
    throw new AppError('User not found.', 401, 'USER_NOT_FOUND');
  }

  // Verify the refresh token hash matches what's stored
  const tokenHash = hashToken(refreshToken);
  if (user.refreshTokenHash !== tokenHash) {
    // Token doesn't match — possible token reuse/theft
    logger.warn({ userId: user._id }, 'Refresh token mismatch — possible token reuse');
    // Invalidate all refresh tokens for security
    user.refreshTokenHash = null;
    await user.save();
    throw new AppError('Refresh token has been revoked.', 401, 'TOKEN_REVOKED');
  }

  // Generate new token pair (token rotation)
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // Store new refresh token hash
  user.refreshTokenHash = hashToken(newRefreshToken);
  await user.save();

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    accessTokenExpiresIn: env.jwt.accessExpiresIn,
  };
}

/**
 * Log out a user by invalidating their refresh token.
 * 
 * @param {string} userId - The user's ID.
 */
async function logout(userId) {
  await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
  logger.info({ userId }, 'User logged out');
}

/**
 * Verify a user's email address.
 * FR-AUTH-002: Email verification.
 * 
 * @param {string} token - The raw verification token from the email link.
 * @returns {object} { user }
 */
async function verifyEmail(token) {
  const tokenHash = hashToken(token);

  const user = await User.findOne({
    emailVerificationToken: tokenHash,
    emailVerificationExpires: { $gt: new Date() },
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) {
    throw new AppError(
      'Verification token is invalid or has expired.',
      400,
      'INVALID_VERIFICATION_TOKEN'
    );
  }

  user.emailVerified = true;
  user.status = USER_STATUS.ACTIVE;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  // SEC-007: Audit log
  await AuditLog.create({
    actorId: user._id,
    actorRole: user.role,
    actorEmail: user.email,
    tenantId: user.tenantId,
    action: 'user.verify_email',
    targetType: 'User',
    targetId: user._id,
  });

  logger.info({ userId: user._id }, 'Email verified successfully');

  return { user: user.toJSON() };
}

/**
 * Initiate a password reset flow.
 * FR-AUTH-002: Password reset.
 * 
 * Always returns success to prevent email enumeration.
 * 
 * @param {string} email - The user's email.
 * @returns {object} { resetToken } - Only returned if user exists (for email sending).
 */
async function forgotPassword(email) {
  const user = await User.findOne({ email });

  // Always return success to prevent email enumeration
  if (!user) {
    return { resetToken: null };
  }

  const resetToken = generateRandomToken();
  const resetTokenHash = hashToken(resetToken);

  user.passwordResetToken = resetTokenHash;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  logger.info({ userId: user._id }, 'Password reset requested');

  return { resetToken };
}

/**
 * Reset password using a valid reset token.
 * FR-AUTH-002: Password reset.
 * 
 * @param {string} token - The raw reset token.
 * @param {string} newPassword - The new password.
 */
async function resetPassword(token, newPassword) {
  const tokenHash = hashToken(token);

  const user = await User.findOne({
    passwordResetToken: tokenHash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires +password');

  if (!user) {
    throw new AppError(
      'Reset token is invalid or has expired.',
      400,
      'INVALID_RESET_TOKEN'
    );
  }

  user.password = newPassword; // Hashed by pre-save hook
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  // Invalidate refresh token so user must re-login
  user.refreshTokenHash = null;
  await user.save();

  // SEC-007: Audit log
  await AuditLog.create({
    actorId: user._id,
    actorRole: user.role,
    actorEmail: user.email,
    tenantId: user.tenantId,
    action: 'user.reset_password',
    targetType: 'User',
    targetId: user._id,
  });

  logger.info({ userId: user._id }, 'Password reset successfully');
}

/**
 * Get the current user's profile.
 * 
 * @param {string} userId - The user's ID.
 * @returns {object} { user, tenant }
 */
async function getCurrentUser(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  }

  let tenant = null;
  if (user.tenantId) {
    tenant = await Tenant.findById(user.tenantId);
  }

  const userData = user.toJSON();

  // Resolve avatarUrl from S3 key to presigned URL (bucket is private)
  if (userData.avatarUrl && !userData.avatarUrl.startsWith('http')) {
    try {
      const env = require('../config/env');
      const { generatePresignedGetUrl } = require('../utils/s3');
      const bucket = env.aws.s3BucketOriginals || env.aws.s3Bucket;
      userData.avatarUrl = await generatePresignedGetUrl(bucket, userData.avatarUrl, 86400);
    } catch (e) {
      // If presigned URL fails, clear it so frontend shows initials
      userData.avatarUrl = null;
    }
  }

  return { user: userData, tenant: tenant?.toJSON() || null };
}

module.exports = {
  register,
  login,
  refreshAccessToken,
  logout,
  verifyEmail,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  generateAccessToken,
  generateRefreshToken,
};
