/**
 * Event Routes â€” /api/events
 * FR-EVENT-001 through FR-EVENT-006: Event CRUD, QR codes, archival.
 *
 * All routes require authentication + tenant scoping (SEC-001/SEC-002).
 */

const express = require('express');
const router = express.Router();

const eventController = require('../controllers/event.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantScope');
const { validate } = require('../middleware/validate');
const {
  createEventSchema,
  updateEventSchema,
  regenerateQrSchema,
  listEventsQuerySchema,
} = require('../validators/event.validators');
const { ROLES } = require('@photofolio/shared');
const { checkEventQuota } = require('../middleware/quotaCheck');

// All event routes: authenticate â†’ authorize â†’ tenant scope
router.use(authenticate, authorize(ROLES.PHOTOGRAPHER), enforceTenantScope);

// FR-EVENT-001/002: Create event (dual QR codes auto-generated)
// FR-PLAN-003: Quota check before creation
router.post(
  '/',
  checkEventQuota,
  validate(createEventSchema, 'body'),
  eventController.createEvent
);

// List events with optional filters
router.get(
  '/',
  validate(listEventsQuerySchema, 'query'),
  eventController.listEvents
);

// FR-EVENT-006: Get event with dashboard stats
router.get(
  '/:eventId',
  eventController.getEvent
);

// FR-EVENT-001/004: Update event details
router.patch(
  '/:eventId',
  validate(updateEventSchema, 'body'),
  eventController.updateEvent
);

// FR-EVENT-003: Regenerate QR code (A or B)
router.post(
  '/:eventId/qr/regenerate',
  validate(regenerateQrSchema, 'body'),
  eventController.regenerateQrCode
);

// FR-EVENT-005: Archive event
router.post(
  '/:eventId/archive',
  eventController.archiveEvent
);

// FR-EVENT-007: Permanently delete event (cascade)
router.delete(
  '/:eventId',
  eventController.deleteEvent
);


// Emergency: Force cascade delete for stuck events
router.post(
  '/:eventId/force-delete',
  eventController.forceDeleteEvent
);

module.exports = router;

