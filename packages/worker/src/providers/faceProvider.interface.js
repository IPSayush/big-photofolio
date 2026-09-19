/**
 * Face Provider Interface — GAP-019 vendor abstraction.
 * 
 * All face detection/embedding operations go through this interface.
 * Concrete providers (AWS Rekognition, InsightFace, etc.) implement
 * these methods. The active provider is selected via environment config.
 * 
 * RISK-015: This abstraction mitigates vendor lock-in.
 * 
 * Phase 1: Interface definition only.
 * Phase 5: Concrete provider implementation.
 */

/**
 * @typedef {Object} DetectedFace
 * @property {Object} boundingBox - { x, y, width, height } normalized 0-1
 * @property {number} confidence - Detection confidence 0-1
 * @property {number} qualityScore - Face quality score 0-1
 */

/**
 * @typedef {Object} FaceEmbedding
 * @property {number[]} vector - Face embedding vector (dimensions depend on provider)
 * @property {number} dimensions - Length of the vector
 */

/**
 * Abstract face provider interface.
 * All concrete providers must implement these methods.
 */
class FaceProviderInterface {
  /**
   * Detect faces in an image.
   * 
   * @param {Buffer} imageBuffer - Raw image data.
   * @returns {Promise<DetectedFace[]>} Array of detected faces.
   */
  async detectFaces(imageBuffer) {
    throw new Error('detectFaces() not implemented — use a concrete provider');
  }

  /**
   * Generate a face embedding vector from a cropped face region.
   * 
   * @param {Buffer} faceImageBuffer - Cropped face image data.
   * @returns {Promise<FaceEmbedding>} The face embedding.
   */
  async generateEmbedding(faceImageBuffer) {
    throw new Error('generateEmbedding() not implemented — use a concrete provider');
  }

  /**
   * Compare two face embeddings and return a similarity score.
   * 
   * @param {number[]} embedding1 - First face embedding vector.
   * @param {number[]} embedding2 - Second face embedding vector.
   * @returns {Promise<number>} Similarity score 0-1 (1 = identical).
   */
  async compareFaces(embedding1, embedding2) {
    throw new Error('compareFaces() not implemented — use a concrete provider');
  }

  /**
   * Get the name of this provider (for logging/config).
   * @returns {string}
   */
  getProviderName() {
    throw new Error('getProviderName() not implemented');
  }

  /**
   * Get the embedding vector dimensions for this provider.
   * Needed for MongoDB Atlas Vector Search index configuration.
   * @returns {number}
   */
  getEmbeddingDimensions() {
    throw new Error('getEmbeddingDimensions() not implemented');
  }
}

module.exports = { FaceProviderInterface };
