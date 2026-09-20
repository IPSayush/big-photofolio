/**
 * Dashboard Routes — photographer and admin monitoring.
 * FR-MON-001/002/003.
 */

const express = require('express');
const router = express.Router();
const dashController = require('../controllers/dashboard.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantScope');
const { ROLES } = require('@photofolio/shared');

// --- Photographer Dashboard (FR-MON-001) ---
router.get(
  '/dashboard',
  authenticate,
  authorize(ROLES.PHOTOGRAPHER),
  enforceTenantScope,
  dashController.getPhotographerDashboard
);

// --- Admin Dashboard (FR-MON-002) ---
router.get(
  '/admin/dashboard',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.getAdminDashboard
);

// --- Admin Suspend/Reinstate (FR-MON-003) ---
router.post(
  '/admin/tenants/:tenantId/suspend',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.suspendTenant
);

router.post(
  '/admin/tenants/:tenantId/reinstate',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.reinstateTenant
);

router.post(
  '/admin/events/:eventId/suspend',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.suspendEvent
);

module.exports = router;
