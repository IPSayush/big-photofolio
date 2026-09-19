/**
 * Matching Service — face matching business logic.
 * FR-MATCH-001: Matching strictly scoped to guest's own event.
 * FR-MATCH-002: Configurable similarity threshold.
 * FR-MATCH-003: Incremental matching support.
 * FR-MATCH-005: Match confidence scores logged.
 * SEC-006: All queries scoped by eventId — never cross-event.
 *
 * For MVP: in-application cosine similarity over Mongoose queries filtered by eventId.
 * Production: Atlas Vector Search with event-scoped filter.
 */

const FaceDetection = require('../models/FaceDetection');
const ReferenceFace = require('../models/ReferenceFace');
const Match = require('../models/Match');
const Event = require('../models/Event');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Similarity 0-1
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  // Map cosine similarity [-1, 1] to [0, 1]
  return Math.max(0, Math.min(1, (dotProduct / magnitude + 1) / 2));
}

/**
 * Find matches for a guest's reference face against all detected faces in an event.
 * FR-MATCH-001: Strictly event-scoped.
 * FR-MATCH-002: Only returns matches above threshold.
 *
 * @param {string} eventId - Event ID.
 * @param {string} tenantId - Tenant ID.
 * @param {string} guestId - Guest ID.
 * @param {number[]} guestEmbedding - Guest's face embedding vector.
 * @param {number} threshold - Similarity threshold (FR-MATCH-002).
 * @returns {Promise<Array<{photoId, faceDetectionId, confidenceScore}>>} Matches.
 */
async function findMatchesForGuest(eventId, tenantId, guestId, guestEmbedding, threshold = 0.6) {
  // SEC-006: Only query face detections in this event
  const faceDetections = await FaceDetection.find({ eventId })
    .select('+embedding')
    .lean();

  const matches = [];

  for (const fd of faceDetections) {
    if (!fd.embedding || fd.embedding.length === 0) continue;

    const similarity = cosineSimilarity(guestEmbedding, fd.embedding);

    // FR-MATCH-002: Only matches above threshold
    if (similarity >= threshold) {
      // FR-PIPE-003: Idempotent — upsert
      try {
        const match = await Match.findOneAndUpdate(
          {
            guestId,
            photoId: fd.photoId,
            faceDetectionId: fd._id,
          },
          {
            guestId,
            photoId: fd.photoId,
            faceDetectionId: fd._id,
            eventId,
            tenantId,
            confidenceScore: similarity,
          },
          { upsert: true, new: true }
        );

        matches.push({
          photoId: fd.photoId,
          faceDetectionId: fd._id,
          confidenceScore: similarity,
          matchId: match._id,
        });
      } catch (err) {
        // Duplicate key is fine (idempotent)
        if (err.code !== 11000) throw err;
      }
    }
  }

  // FR-MATCH-005: Log match results
  logger.info(
    {
      eventId,
      guestId: guestId.toString(),
      totalFaces: faceDetections.length,
      matchesFound: matches.length,
      threshold,
    },
    'Guest matching completed'
  );

  // Update event match stats
  if (matches.length > 0) {
    await Event.findByIdAndUpdate(eventId, {
      $inc: { 'stats.matchCount': matches.length },
    });
  }

  return matches;
}

/**
 * Get all matches for a guest in an event (for gallery delivery).
 * FR-MATCH-001: Strictly event-scoped.
 *
 * @param {string} eventId - Event ID.
 * @param {string} guestId - Guest ID.
 * @returns {Promise<Array>} Matched photos with confidence scores.
 */
async function getMatchesForGuest(eventId, guestId) {
  const matches = await Match.find({ eventId, guestId })
    .sort({ confidenceScore: -1 })
    .populate('photoId', '-s3OriginalKey')
    .lean();

  return matches.map((m) => ({
    matchId: m._id,
    photoId: m.photoId?._id || m.photoId,
    photo: m.photoId,
    confidenceScore: m.confidenceScore,
    matchedAt: m.createdAt,
  }));
}

/**
 * Get match statistics for an event (photographer dashboard).
 * FR-MON-001: Per-event match stats.
 *
 * @param {string} tenantId - Verified tenant ID.
 * @param {string} eventId - Event ID.
 * @returns {Promise<object>} Match statistics.
 */
async function getMatchStats(tenantId, eventId) {
  // SEC-001: Verify event belongs to tenant
  const event = await Event.findOne({ _id: eventId, tenantId });
  if (!event) {
    throw new AppError('Event not found.', 404, 'EVENT_NOT_FOUND');
  }

  const [totalFaces, totalMatches, uniqueGuests, uniquePhotosMatched] = await Promise.all([
    FaceDetection.countDocuments({ eventId }),
    Match.countDocuments({ eventId }),
    Match.distinct('guestId', { eventId }).then((ids) => ids.length),
    Match.distinct('photoId', { eventId }).then((ids) => ids.length),
  ]);

  return {
    totalFacesDetected: totalFaces,
    totalMatches,
    uniqueGuestsMatched: uniqueGuests,
    uniquePhotosMatched,
  };
}

module.exports = {
  cosineSimilarity,
  findMatchesForGuest,
  getMatchesForGuest,
  getMatchStats,
};
