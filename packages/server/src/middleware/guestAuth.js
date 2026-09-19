/**
 * Guest Auth Middleware — lightweight event-scoped token authentication.
 * DEC-003: No full account required for guests in MVP.
 *
 * Extracts guest token from `Authorization: Guest <token>` header,
 * verifies the guest exists and is active, attaches req.guest.
 *
 * This is separate from the photographer auth middleware.
 */

const Guest = require('../models/Guest');
const { AppError } = require('./errorHandler');
const { GUEST_STATUS } = require('@photofolio/shared');

/**
 * Authenticate guest via session token.
 * Requires `Authorization: Guest <token>` header.
 */
async function guestAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Guest ')) {
      throw new AppError('Guest authentication required.', 401, 'GUEST_AUTH_REQUIRED');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new AppError('Invalid guest token format.', 401, 'INVALID_GUEST_TOKEN');
    }

    // Hash token and look up
    const tokenHash = Guest.hashToken(token);
    const guest = await Guest.findOne({ sessionTokenHash: tokenHash });

    if (!guest) {
      throw new AppError('Invalid or expired guest token.', 401, 'INVALID_GUEST_TOKEN');
    }

    // Check consent not withdrawn
    if (guest.status === GUEST_STATUS.CONSENT_WITHDRAWN) {
      throw new AppError(
        'Consent has been withdrawn. Please re-consent to access this feature.',
        403,
        'CONSENT_WITHDRAWN'
      );
    }

    // Attach guest info to request
    req.guest = guest;
    req.guestId = guest._id;
    req.eventId = guest.eventId;
    req.tenantId = guest.tenantId;

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { guestAuth };
