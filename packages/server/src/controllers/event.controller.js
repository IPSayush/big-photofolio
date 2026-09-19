/**
 * Event Controller — thin HTTP layer for event operations.
 * FR-EVENT-001 through FR-EVENT-006.
 *
 * Routes: /api/events/*
 */

const eventService = require('../services/event.service');
const { auditParamsFromReq } = require('../services/audit.service');

/**
 * POST /api/events
 * FR-EVENT-001/002: Create event with dual QR codes.
 */
async function createEvent(req, res, next) {
  try {
    const result = await eventService.createEvent(
      req.tenantId,
      req.body,
      auditParamsFromReq(req)
    );

    res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events
 * List events for the authenticated photographer's tenant.
 */
async function listEvents(req, res, next) {
  try {
    const result = await eventService.listEvents(req.tenantId, req.query);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events/:eventId
 * FR-EVENT-006: Get event with dashboard stats.
 */
async function getEvent(req, res, next) {
  try {
    const result = await eventService.getEvent(req.tenantId, req.params.eventId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/events/:eventId
 * FR-EVENT-001/004: Update event details.
 */
async function updateEvent(req, res, next) {
  try {
    const result = await eventService.updateEvent(
      req.tenantId,
      req.params.eventId,
      req.body,
      auditParamsFromReq(req)
    );

    res.status(200).json({
      success: true,
      message: 'Event updated successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/events/:eventId/qr/regenerate
 * FR-EVENT-003: Regenerate QR code (A or B).
 */
async function regenerateQrCode(req, res, next) {
  try {
    const result = await eventService.regenerateQrCode(
      req.tenantId,
      req.params.eventId,
      req.body.qrType,
      auditParamsFromReq(req)
    );

    res.status(200).json({
      success: true,
      message: `QR-${req.body.qrType} code regenerated successfully. Old code is now invalid.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/events/:eventId/archive
 * FR-EVENT-005: Archive event.
 */
async function archiveEvent(req, res, next) {
  try {
    const result = await eventService.archiveEvent(
      req.tenantId,
      req.params.eventId,
      auditParamsFromReq(req)
    );

    res.status(200).json({
      success: true,
      message: 'Event archived successfully.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  updateEvent,
  regenerateQrCode,
  archiveEvent,
};
