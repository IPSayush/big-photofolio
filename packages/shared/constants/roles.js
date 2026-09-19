/**
 * User / access roles for the platform.
 * FR-AUTH-003: Role-based access — Photographer, Admin (MVP); Staff (Phase 2).
 * Guest role is used for event-scoped guest tokens (OD-1 decision).
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  PHOTOGRAPHER: 'photographer',
  // STAFF: 'staff', // Phase 2 — FR-AUTH-003
  GUEST: 'guest',
});

/**
 * Roles allowed to authenticate via the main auth system (email + password).
 * Guests use a separate event-scoped token flow.
 */
const AUTHENTICABLE_ROLES = Object.freeze([ROLES.ADMIN, ROLES.PHOTOGRAPHER]);

module.exports = { ROLES, AUTHENTICABLE_ROLES };
