/**
 * Shared barrel export for @photofolio/shared.
 */

const roles = require('./constants/roles');
const statuses = require('./constants/statuses');

module.exports = {
  ...roles,
  ...statuses,
};
