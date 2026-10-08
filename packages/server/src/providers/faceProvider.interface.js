/**
 * Face Provider Interface — server-side copy.
 * GAP-019: Vendor abstraction for face detection/embedding.
 *
 * This is a separate copy from packages/worker/src/providers/faceProvider.interface.js
 * per AGENTS.md rule: "NEVER require() from packages/server/ inside packages/worker/ code"
 * (and vice versa).
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

class FaceProviderInterface {
  async detectFaces(imageBuffer) {
    throw new Error('detectFaces() not implemented — use a concrete provider');
  }

  async generateEmbedding(faceImageBuffer) {
    throw new Error('generateEmbedding() not implemented — use a concrete provider');
  }

  async compareFaces(embedding1, embedding2) {
    throw new Error('compareFaces() not implemented — use a concrete provider');
  }

  getProviderName() {
    throw new Error('getProviderName() not implemented');
  }

  getEmbeddingDimensions() {
    throw new Error('getEmbeddingDimensions() not implemented');
  }
}

module.exports = { FaceProviderInterface };
