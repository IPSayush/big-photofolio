/**
 * Profile Routes — /api/profile
 * FR-PROFILE-001/002/003: Photographer profile CRUD.
 *
 * All routes require authentication + tenant scoping (SEC-001/SEC-002).
 */

const express = require('express');
const router = express.Router();

const profileController = require('../controllers/profile.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantScope');
const { validate } = require('../middleware/validate');
const { updateProfileSchema } = require('../validators/profile.validators');
const { ROLES } = require('@photofolio/shared');

// All profile routes: authenticate → authorize → tenant scope
router.use(authenticate, authorize(ROLES.PHOTOGRAPHER), enforceTenantScope);

// FR-PROFILE-001/003: Get photographer profile with plan/usage
router.get('/', profileController.getProfile);

// FR-PROFILE-001/002: Update photographer profile (versioned, audited)
router.patch(
  '/',
  validate(updateProfileSchema, 'body'),
  profileController.updateProfile
);

module.exports = router;
