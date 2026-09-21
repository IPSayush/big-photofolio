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

// --- Admin Plan Management (FR-PLAN-001, API-010, SEC-007) ---

// List all plans (active + inactive) — admin-only view
router.get(
  '/admin/plans',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.listAdminPlans
);

// Create a new plan
router.post(
  '/admin/plans',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.createPlan
);

// Update plan fields
router.put(
  '/admin/plans/:planId',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.updatePlan
);

// Archive or restore a plan
router.patch(
  '/admin/plans/:planId/status',
  authenticate,
  authorize(ROLES.ADMIN),
  dashController.togglePlanStatus
);

module.exports = router;
