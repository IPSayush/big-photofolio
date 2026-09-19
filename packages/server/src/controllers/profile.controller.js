/**
 * Profile Controller — thin HTTP layer for profile operations.
 * FR-PROFILE-001/002/003: Get and update photographer profile.
 *
 * Routes: /api/profile/*
 */

const profileService = require('../services/profile.service');
const { auditParamsFromReq } = require('../services/audit.service');

/**
 * GET /api/profile
 * FR-PROFILE-001/003: Get photographer profile with plan/usage info.
 */
async function getProfile(req, res, next) {
  try {
    const result = await profileService.getProfile(req.tenantId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/profile
 * FR-PROFILE-001/002: Update profile (versioned, audited).
 */
async function updateProfile(req, res, next) {
  try {
    const result = await profileService.updateProfile(
      req.tenantId,
      req.body,
      auditParamsFromReq(req)
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile };
