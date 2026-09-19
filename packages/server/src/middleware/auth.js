/**
 * JWT Authentication Middleware.
 * FR-AUTH-005: Short-lived access tokens with refresh support.
 * SEC-002: Server-side verification — never trust client-supplied roles/claims.
 * 
 * Extracts and verifies JWT from Authorization header.
 * Attaches decoded user payload to req.user.
 */

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');
const User = require('../models/User');
const { ROLES, USER_STATUS } = require('@photofolio/shared');

/**
 * Verify JWT access token and attach user to request.
 * SEC-002: Re-verifies role/status against DB state — does NOT trust token claims alone.
 */
async function authenticate(req, res, next) {
  try {
    // Extract token from Authorization: Bearer <token>
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. Please provide a valid access token.',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, env.jwt.accessSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Access token expired. Please refresh your token.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid access token.',
      });
    }

    // SEC-002: Re-verify user exists and is active — don't trust token alone
    const user = await User.findById(decoded.userId).select('+refreshTokenHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account not found.',
      });
    }

    if (user.status === USER_STATUS.SUSPENDED) {
      return res.status(403).json({
        success: false,
        error: 'Account suspended. Please contact support.',
        code: 'ACCOUNT_SUSPENDED',
      });
    }

    if (user.status === USER_STATUS.DEACTIVATED) {
      return res.status(403).json({
        success: false,
        error: 'Account deactivated.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Attach verified user to request
    req.user = {
      userId: user._id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
    };

    next();
  } catch (err) {
    logger.error({ err }, 'Auth middleware: unexpected error');
    return res.status(500).json({
      success: false,
      error: 'Authentication service error.',
    });
  }
}

/**
 * Role-based authorization middleware factory.
 * FR-AUTH-003: Restrict access to specific roles.
 * 
 * Usage: authorize(ROLES.ADMIN) or authorize(ROLES.ADMIN, ROLES.PHOTOGRAPHER)
 * 
 * @param  {...string} allowedRoles - Roles permitted to access the route.
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required.',
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        { userId: req.user.userId, role: req.user.role, required: allowedRoles },
        'Authorization denied: insufficient role'
      );
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action.',
        code: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
}

/**
 * Require email verification for protected actions.
 * FR-AUTH-002: Email verification is part of the registration flow.
 */
function requireVerifiedEmail(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required.',
    });
  }

  if (!req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      error: 'Please verify your email address before continuing.',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }

  next();
}

module.exports = { authenticate, authorize, requireVerifiedEmail };
