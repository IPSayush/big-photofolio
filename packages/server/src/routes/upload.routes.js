/**
 * Upload Routes — /api/events/:eventId/photos
 * FR-UPLOAD-001 through FR-UPLOAD-007: Photo upload, status, and management.
 *
 * All routes require authentication + tenant scoping (SEC-001/SEC-002).
 * Mounted with mergeParams to access :eventId from the parent path.
 */

const express = require('express');
const router = express.Router({ mergeParams: true });

const uploadController = require('../controllers/upload.controller');
const { authenticate, authorize } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantScope');
const { validate } = require('../middleware/validate');
const {
  requestUploadUrlsSchema,
  confirmUploadSchema,
  listPhotosQuerySchema,
} = require('../validators/upload.validators');
const { ROLES } = require('@photofolio/shared');

// All upload routes: authenticate → authorize → tenant scope
router.use(authenticate, authorize(ROLES.PHOTOGRAPHER), enforceTenantScope);

// FR-UPLOAD-002 / API-007: Request pre-signed S3 upload URLs
router.post(
  '/upload-url',
  validate(requestUploadUrlsSchema, 'body'),
  uploadController.requestUploadUrls
);

// FR-UPLOAD-003: Confirm uploads completed
router.post(
  '/confirm',
  validate(confirmUploadSchema, 'body'),
  uploadController.confirmUpload
);

// FR-UPLOAD-007 / API-008: Upload and processing status
router.get(
  '/status',
  uploadController.getUploadStatus
);

// List photos with optional filters
router.get(
  '/',
  validate(listPhotosQuerySchema, 'query'),
  uploadController.listPhotos
);

// FR-PIPE-004: Failed photos for retry UI
router.get(
  '/failed',
  uploadController.getFailedPhotos
);

// FR-PIPE-004: Retry failed photos — re-enqueue for processing
router.post(
  '/retry',
  validate(confirmUploadSchema, 'body'), // Reuses same { photoIds } schema
  uploadController.retryFailedPhotos
);

module.exports = router;
