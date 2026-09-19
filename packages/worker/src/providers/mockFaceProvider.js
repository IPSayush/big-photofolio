/**
 * Mock Face Provider — deterministic face detection/embedding for dev/test.
 * GAP-019: Concrete implementation of FaceProviderInterface.
 * DEC-002: No custom model — this mock enables development without external APIs.
 *
 * Behavior:
 * - detectFaces(): Always returns 1 face with consistent bounding box
 * - generateEmbedding(): Returns a 128-dim vector derived from image content hash
 *   (same image → same embedding → deterministic matching in tests)
 * - compareFaces(): Cosine similarity calculation
 */

const crypto = require('crypto');
const { FaceProviderInterface } = require('./faceProvider.interface');

class MockFaceProvider extends FaceProviderInterface {
  constructor() {
    super();
    this._dimensions = 128;
  }

  /**
   * Detect faces in an image.
   * Mock: always returns exactly 1 face with a centered bounding box.
   *
   * @param {Buffer} imageBuffer - Raw image data.
   * @returns {Promise<import('./faceProvider.interface').DetectedFace[]>}
   */
  async detectFaces(imageBuffer) {
    // Use image hash to generate deterministic but varied results
    const hash = crypto.createHash('md5').update(imageBuffer).digest('hex');
    const seed = parseInt(hash.substring(0, 8), 16);

    // Deterministic "random" position based on image content
    const x = 0.2 + (seed % 100) / 500;  // 0.2 - 0.4
    const y = 0.15 + ((seed >> 8) % 100) / 500;  // 0.15 - 0.35
    const width = 0.3 + ((seed >> 16) % 50) / 500;  // 0.3 - 0.4
    const height = 0.35 + ((seed >> 24) % 50) / 500;  // 0.35 - 0.45

    return [
      {
        boundingBox: {
          x: Math.min(x, 0.6),
          y: Math.min(y, 0.5),
          width: Math.min(width, 0.4),
          height: Math.min(height, 0.45),
        },
        confidence: 0.95 + (seed % 50) / 1000,  // 0.95 - 0.999
        qualityScore: 0.85 + (seed % 150) / 1000,  // 0.85 - 0.999
      },
    ];
  }

  /**
   * Generate a face embedding vector from a cropped face region.
   * Mock: generates a deterministic 128-dim vector from image content hash.
   * Same image content → same embedding (enables deterministic test matching).
   *
   * @param {Buffer} faceImageBuffer - Cropped face image data.
   * @returns {Promise<import('./faceProvider.interface').FaceEmbedding>}
   */
  async generateEmbedding(faceImageBuffer) {
    // Create deterministic embedding from image content
    const hash = crypto.createHash('sha256').update(faceImageBuffer).digest();

    // Generate 128-dim vector from hash bytes (normalized)
    const vector = new Array(this._dimensions);
    for (let i = 0; i < this._dimensions; i++) {
      // Use hash bytes cyclically, map to [-1, 1] range
      const byteVal = hash[i % hash.length];
      vector[i] = (byteVal / 127.5) - 1;
    }

    // L2-normalize the vector (required for cosine similarity)
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < this._dimensions; i++) {
      vector[i] = vector[i] / magnitude;
    }

    return {
      vector,
      dimensions: this._dimensions,
    };
  }

  /**
   * Compare two face embeddings via cosine similarity.
   *
   * @param {number[]} embedding1 - First face embedding vector.
   * @param {number[]} embedding2 - Second face embedding vector.
   * @returns {Promise<number>} Similarity score 0-1 (1 = identical).
   */
  async compareFaces(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embedding dimensions must match');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (magnitude === 0) return 0;

    // Cosine similarity → [0, 1] range
    const cosineSim = dotProduct / magnitude;
    return Math.max(0, Math.min(1, (cosineSim + 1) / 2));
  }

  getProviderName() {
    return 'mock';
  }

  getEmbeddingDimensions() {
    return this._dimensions;
  }
}

module.exports = { MockFaceProvider };
