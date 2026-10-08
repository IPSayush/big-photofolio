/**
 * Server Face Provider Factory — GAP-019 vendor abstraction.
 * Server-side equivalent of worker's providerFactory.js.
 *
 * Used by guest.service.js to process selfie → embedding.
 *
 * AGENTS.md: Server has its own provider copies, never requires from worker.
 */

let _instance = null;

/**
 * Get the configured face provider singleton.
 * @returns {import('./faceProvider.interface').FaceProviderInterface}
 */
function getFaceProvider() {
  if (_instance) return _instance;

  const providerName = process.env.FACE_PROVIDER || 'mock';

  switch (providerName) {
    case 'mock': {
      // Mock provider — generates hash-based embeddings (no AI)
      const crypto = require('crypto');
      const { FaceProviderInterface } = require('./faceProvider.interface');

      class MockFaceProvider extends FaceProviderInterface {
        async detectFaces(imageBuffer) {
          return [{
            boundingBox: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 },
            confidence: 0.95,
            qualityScore: 0.9,
          }];
        }

        async generateEmbedding(faceImageBuffer) {
          const hash = crypto.createHash('sha256').update(faceImageBuffer).digest();
          const vector = new Array(128);
          for (let i = 0; i < 128; i++) {
            vector[i] = (hash[i % hash.length] / 127.5) - 1;
          }
          const mag = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
          for (let i = 0; i < 128; i++) vector[i] /= mag;
          return { vector, dimensions: 128 };
        }

        async compareFaces(e1, e2) {
          if (e1.length !== e2.length) return 0;
          let dot = 0, n1 = 0, n2 = 0;
          for (let i = 0; i < e1.length; i++) {
            dot += e1[i] * e2[i]; n1 += e1[i] * e1[i]; n2 += e2[i] * e2[i];
          }
          const mag = Math.sqrt(n1) * Math.sqrt(n2);
          return mag === 0 ? 0 : Math.max(0, Math.min(1, (dot / mag + 1) / 2));
        }

        getProviderName() { return 'mock'; }
        getEmbeddingDimensions() { return 128; }
      }

      _instance = new MockFaceProvider();
      break;
    }

    case 'face-api': {
      const { FaceApiFaceProvider } = require('./faceApiFaceProvider');
      _instance = new FaceApiFaceProvider();
      break;
    }

    case 'rekognition':
      throw new Error(
        'AWS Rekognition is not yet implemented for server-side selfie processing. ' +
        'Use FACE_PROVIDER=face-api for free open-source provider.'
      );

    default:
      throw new Error(
        `Unknown FACE_PROVIDER: "${providerName}". Supported: mock, face-api`
      );
  }

  return _instance;
}

function resetFaceProvider() {
  _instance = null;
}

module.exports = { getFaceProvider, resetFaceProvider };
