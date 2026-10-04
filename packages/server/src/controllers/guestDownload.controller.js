// Add download endpoint to guest controller
const guestDownload = async (req, res, next) => {
  try {
    const { photoId } = req.params;
    const Photo = require('../models/Photo');
    const { generatePresignedGetUrl } = require('../utils/s3');
    const env = require('../config/env');
    const https = require('https');
    const http = require('http');

    const photo = await Photo.findById(photoId).lean();
    if (!photo) {
      return res.status(404).json({ success: false, error: 'Photo not found.' });
    }

    const bucket = env.aws.s3BucketOriginals || env.aws.s3Bucket;
    const url = await generatePresignedGetUrl(bucket, photo.s3OriginalKey);

    // Proxy the S3 file through server with download headers
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (s3Res) => {
      const fileName = photo.originalFileName || `photo-${photoId}.jpg`;
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Type', s3Res.headers['content-type'] || 'image/jpeg');
      if (s3Res.headers['content-length']) {
        res.setHeader('Content-Length', s3Res.headers['content-length']);
      }
      s3Res.pipe(res);
    }).on('error', (err) => {
      next(err);
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { guestDownload };