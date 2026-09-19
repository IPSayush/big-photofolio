/**
 * Audit Service — centralized audit logging.
 * SEC-007: All security-relevant actions are audit-logged.
 * 
 * Provides a clean API for recording audit events from any service.
 */

const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Record an audit log entry.
 * 
 * @param {object} params
 * @param {string} params.actorId - Who performed the action.
 * @param {string} params.actorRole - Role of the actor.
 * @param {string} params.actorEmail - Email of the actor.
 * @param {string} [params.tenantId] - Tenant context (null for platform ops).
 * @param {string} params.action - Action identifier (e.g., 'user.login').
 * @param {string} params.targetType - Type of entity acted upon.
 * @param {string} params.targetId - ID of the entity acted upon.
 * @param {object} [params.metadata] - Additional context.
 * @param {string} [params.ipAddress] - Client IP.
 * @param {string} [params.userAgent] - Client user agent.
 */
async function logAction(params) {
  try {
    await AuditLog.create(params);
  } catch (err) {
    // Audit logging should never fail silently, but also never crash the request
    logger.error({ err, auditParams: params }, 'Failed to write audit log');
  }
}

/**
 * Create audit params from an Express request.
 * Convenience helper for controllers.
 * 
 * @param {object} req - Express request.
 * @returns {object} Partial audit params.
 */
function auditParamsFromReq(req) {
  return {
    actorId: req.user?.userId,
    actorRole: req.user?.role,
    actorEmail: req.user?.email,
    tenantId: req.tenantId || req.user?.tenantId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  };
}

module.exports = { logAction, auditParamsFromReq };
