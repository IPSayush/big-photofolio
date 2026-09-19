/**
 * Tenant Scoping Middleware — CRITICAL SECURITY CONTROL.
 * SEC-001: Every request touching tenant data verifies caller authorization for that tenant.
 * SEC-002: Client-supplied IDs are never trusted — all checks use backend state.
 * 
 * This middleware:
 * 1. Extracts tenant_id from the authenticated user's JWT-verified record.
 * 2. Attaches it to req.tenantId for use by downstream services.
 * 3. For admin users, allows cross-tenant access when explicitly scoped.
 * 
 * IMPORTANT: Mongoose query middleware in models should also enforce tenant_id
 * filtering — this Express middleware is the first line of defense, not the only one.
 */

const logger = require('../utils/logger');
const Tenant = require('../models/Tenant');
const { ROLES, TENANT_STATUS } = require('@photofolio/shared');

/**
 * Enforce tenant scoping on all tenant-bound routes.
 * 
 * For photographers: tenant_id comes from their authenticated user record.
 * For admins: can optionally target a specific tenant via query/param,
 *             but must still pass through validation.
 * 
 * SEC-001: This is NOT optional. Every tenant-scoped route MUST use this middleware.
 */
async function enforceTenantScope(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required for tenant-scoped operations.',
      });
    }

    const { role, tenantId: userTenantId } = req.user;

    // Admins can operate cross-tenant when explicitly targeting one
    if (role === ROLES.ADMIN) {
      // Admin targeting a specific tenant (e.g., /admin/tenants/:tenantId/...)
      const targetTenantId = req.params.tenantId || req.query.tenantId || req.body?.tenantId;

      if (targetTenantId) {
        // Validate the target tenant exists
        const tenant = await Tenant.findById(targetTenantId);
        if (!tenant) {
          return res.status(404).json({
            success: false,
            error: 'Target tenant not found.',
          });
        }
        req.tenantId = tenant._id;
        req.tenant = tenant;
      }
      // Admins without a target tenant can proceed (platform-level operations)
      return next();
    }

    // Photographers MUST have a tenant_id — SEC-001
    if (!userTenantId) {
      logger.error(
        { userId: req.user.userId },
        'Tenant scope violation: photographer without tenant_id'
      );
      return res.status(403).json({
        success: false,
        error: 'Account not associated with a tenant. Please contact support.',
        code: 'NO_TENANT',
      });
    }

    // Verify tenant exists and is active
    const tenant = await Tenant.findById(userTenantId);
    if (!tenant) {
      logger.error(
        { userId: req.user.userId, tenantId: userTenantId },
        'Tenant scope violation: tenant not found'
      );
      return res.status(403).json({
        success: false,
        error: 'Tenant account not found.',
        code: 'TENANT_NOT_FOUND',
      });
    }

    if (tenant.status === TENANT_STATUS.SUSPENDED) {
      return res.status(403).json({
        success: false,
        error: 'Tenant account is suspended. Please contact support.',
        code: 'TENANT_SUSPENDED',
      });
    }

    if (tenant.status === TENANT_STATUS.DEACTIVATED) {
      return res.status(403).json({
        success: false,
        error: 'Tenant account is deactivated.',
        code: 'TENANT_DEACTIVATED',
      });
    }

    // SEC-002: Prevent photographer from accessing another tenant's data
    // The tenant_id comes from the verified JWT, not from the request body/params
    if (req.params.tenantId && req.params.tenantId !== userTenantId.toString()) {
      logger.warn(
        {
          userId: req.user.userId,
          ownTenantId: userTenantId,
          requestedTenantId: req.params.tenantId,
        },
        'Tenant scope violation: cross-tenant access attempt'
      );
      return res.status(403).json({
        success: false,
        error: 'Access denied: you cannot access another tenant\'s data.',
        code: 'CROSS_TENANT_ACCESS',
      });
    }

    // Attach verified tenant context
    req.tenantId = tenant._id;
    req.tenant = tenant;

    next();
  } catch (err) {
    logger.error({ err }, 'Tenant scope middleware: unexpected error');
    return res.status(500).json({
      success: false,
      error: 'Tenant verification error.',
    });
  }
}

module.exports = { enforceTenantScope };
