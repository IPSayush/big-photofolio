/**
 * Dashboard Controller — photographer and admin monitoring endpoints.
 * FR-MON-001/002/003.
 */

const dashboardService = require('../services/dashboard.service');
const { AppError } = require('../middleware/errorHandler');

/**
 * GET /api/dashboard — photographer dashboard (FR-MON-001).
 */
async function getPhotographerDashboard(req, res, next) {
  try {
    const result = await dashboardService.getPhotographerDashboard(req.tenantId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/dashboard — admin platform dashboard (FR-MON-002).
 */
async function getAdminDashboard(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const result = await dashboardService.getAdminDashboard({ page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/tenants/:tenantId/suspend — suspend tenant (FR-MON-003).
 */
async function suspendTenant(req, res, next) {
  try {
    const { tenantId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError('Reason is required for suspension.', 400, 'MISSING_REASON');
    }

    const adminUser = { userId: req.user.userId, role: req.user.role, email: req.user.email };
    const result = await dashboardService.suspendTenant(tenantId, reason, adminUser);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/tenants/:tenantId/reinstate — reinstate tenant (FR-MON-003).
 */
async function reinstateTenant(req, res, next) {
  try {
    const { tenantId } = req.params;
    const adminUser = { userId: req.user.userId, role: req.user.role, email: req.user.email };
    const result = await dashboardService.reinstateTenant(tenantId, adminUser);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/events/:eventId/suspend — suspend event (FR-MON-003).
 */
async function suspendEvent(req, res, next) {
  try {
    const { eventId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      throw new AppError('Reason is required.', 400, 'MISSING_REASON');
    }

    const adminUser = { userId: req.user.userId, role: req.user.role, email: req.user.email };
    const result = await dashboardService.suspendEvent(eventId, reason, adminUser);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPhotographerDashboard,
  getAdminDashboard,
  suspendTenant,
  reinstateTenant,
  suspendEvent,
};
