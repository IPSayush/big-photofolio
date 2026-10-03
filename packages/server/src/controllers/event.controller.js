/**
 * Event Controller — thin HTTP layer for event operations.
 * FR-EVENT-001 through FR-EVENT-006.
 *
 * Routes: /api/events/*
 */

const eventService = require('../services/event.service');
const { initiateEventDelete } = require('../services/eventDelete.service');
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

/**
 * DELETE /api/events/:eventId
 * FR-EVENT-007: Permanently delete event with cascade.
 * Marks event as "deleting" and enqueues async cascade delete job.
 */
async function deleteEvent(req, res, next) {
  try {
    const result = await initiateEventDelete(
      req.tenantId,
      req.params.eventId,
      auditParamsFromReq(req)
    );

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}


/**
 * POST /api/events/:eventId/force-delete
 * Emergency: Force cascade delete for events stuck in 'deleting' status.
 * Runs the cascade delete synchronously on the server instead of via worker.
 */
async function forceDeleteEvent(req, res, next) {
  try {
    const Event = require('../models/Event');
    const Photo = require('../models/Photo');
    const PhotoDerivative = require('../models/PhotoDerivative');
    const FaceDetection = require('../models/FaceDetection');
    const Match = require('../models/Match');
    const Guest = require('../models/Guest');
    const ConsentRecord = require('../models/ConsentRecord');
    const ReferenceFace = require('../models/ReferenceFace');
    
    const eventId = req.params.eventId;
    const tenantId = req.tenantId;
    
    const event = await Event.findOne({ _id: eventId, tenantId });
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // Fast DB-only cascade delete (skip S3 to avoid Vercel timeout)
    const summary = {};
    summary.matches = (await Match.deleteMany({ eventId })).deletedCount;
    summary.faceDetections = (await FaceDetection.deleteMany({ eventId })).deletedCount;
    summary.photoDerivatives = (await PhotoDerivative.deleteMany({ eventId })).deletedCount;
    summary.photos = (await Photo.deleteMany({ eventId, tenantId })).deletedCount;
    
    const guests = await Guest.find({ eventId, tenantId }).select('_id').lean();
    const guestIds = guests.map(g => g._id);
    if (guestIds.length > 0) {
      summary.consentRecords = (await ConsentRecord.deleteMany({ guestId: { $in: guestIds } })).deletedCount;
      summary.referenceFaces = (await ReferenceFace.deleteMany({ guestId: { $in: guestIds } })).deletedCount;
    }
    summary.guests = (await Guest.deleteMany({ eventId, tenantId })).deletedCount;
    
    // Delete event itself
    await Event.deleteOne({ _id: eventId, tenantId });

    res.status(200).json({
      success: true,
      message: 'Event permanently deleted (S3 cleanup skipped for speed).',
      data: summary,
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
  deleteEvent,
  forceDeleteEvent,
};


