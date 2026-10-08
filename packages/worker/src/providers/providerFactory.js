/**
 * Face Provider Factory — GAP-019 vendor abstraction.
 * Returns the active face provider based on FACE_PROVIDER env var.
 *
 * Supported providers:
 * - 'mock'        — deterministic, no external APIs (dev/test default)
 * - 'face-api'    — @vladmandic/face-api, free, MIT license (production-ready)
 * - 'rekognition' — AWS Rekognition, paid managed service (skeleton, future)
 */

const { MockFaceProvider } = require('./mockFaceProvider');

let _instance = null;

/**
 * Get the configured face provider singleton.
 * Providers are lazily required to avoid import-time crashes
 * (e.g., tfjs-node native module not found in test environments).
 *
 * @returns {import('./faceProvider.interface').FaceProviderInterface}
 */
function getFaceProvider() {
  if (_instance) return _instance;

  const providerName = process.env.FACE_PROVIDER || 'mock';

  switch (providerName) {
    case 'mock':
      _instance = new MockFaceProvider();
      break;

    case 'face-api': {
      // Lazy require — @vladmandic/face-api + @tensorflow/tfjs-node are heavy
      const { FaceApiFaceProvider } = require('./faceApiFaceProvider');
      _instance = new FaceApiFaceProvider();
      break;
    }

    case 'rekognition': {
      // Lazy require — skeleton, will throw "not implemented"
      const { RekognitionFaceProvider } = require('./rekognitionFaceProvider');
      _instance = new RekognitionFaceProvider();
      break;
    }

    default:
      throw new Error(
        `Unknown FACE_PROVIDER: "${providerName}". ` +
        `Supported: mock, face-api, rekognition`
      );
  }

  return _instance;
}

/**
 * Reset the singleton (for testing).
 */
function resetFaceProvider() {
  _instance = null;
}

module.exports = { getFaceProvider, resetFaceProvider };
