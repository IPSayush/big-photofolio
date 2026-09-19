/**
 * Upload Controller — thin HTTP layer for upload operations.
 * FR-UPLOAD-001 through FR-UPLOAD-007.
 *
 * Routes: /api/events/:eventId/photos/*
 */

const uploadService = require('../services/upload.service');
const { auditParamsFromReq } = require('../services/audit.service');

/**
 * POST /api/events/:eventId/photos/upload-url
 * FR-UPLOAD-002: Request pre-signed S3 upload URLs.
 * API-007: Get pre-signed S3 upload URL.
 */
async function requestUploadUrls(req, res, next) {
  try {
    const result = await uploadService.requestUploadUrls(
      req.tenantId,
      req.params.eventId,
      req.body.files,
      auditParamsFromReq(req)
    );

    res.status(200).json({
      success: true,
      message: 'Upload URLs generated.',
      data: result,
    });
  } catch (err) {
    // Preserve validation details if present
    if (err.details) {
      return res.status(err.statusCode || 400).json({
        success: false,
        error: err.message,
        code: err.code,
        details: err.details,
      });
    }
    next(err);
  }
}

/**
 * POST /api/events/:eventId/photos/confirm
 * FR-UPLOAD-003: Confirm uploads completed for batch resumability.
 */
async function confirmUpload(req, res, next) {
  try {
    const result = await uploadService.confirmUpload(
      req.tenantId,
      req.params.eventId,
      req.body.photoIds
    );

    res.status(200).json({
      success: true,
      message: `${result.confirmed} uploads confirmed.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events/:eventId/photos/status
 * FR-UPLOAD-007 / API-008: Upload and processing status.
 */
async function getUploadStatus(req, res, next) {
  try {
    const result = await uploadService.getUploadStatus(
      req.tenantId,
      req.params.eventId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events/:eventId/photos
 * List photos with optional status filter.
 */
async function listPhotos(req, res, next) {
  try {
    const result = await uploadService.listPhotos(
      req.tenantId,
      req.params.eventId,
      req.query
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/events/:eventId/photos/failed
 * FR-PIPE-004: Get failed photos with reasons for retry.
 */
async function getFailedPhotos(req, res, next) {
  try {
    const result = await uploadService.getFailedPhotos(
      req.tenantId,
      req.params.eventId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}
/**
 * POST /api/events/:eventId/photos/retry
 * FR-PIPE-004: Retry failed photos — re-enqueue for processing.
 */
async function retryFailedPhotos(req, res, next) {
  try {
    const result = await uploadService.retryFailedPhotos(
      req.tenantId,
      req.params.eventId,
      req.body.photoIds,
      auditParamsFromReq(req)
    );

    res.status(200).json({
      success: true,
      message: `${result.retried} photos re-enqueued for processing.`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestUploadUrls,
  confirmUpload,
  getUploadStatus,
  listPhotos,
  getFailedPhotos,
  retryFailedPhotos,
};
