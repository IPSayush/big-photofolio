/**
 * Face Provider Factory — GAP-019 vendor abstraction.
 * Returns the active face provider based on FACE_PROVIDER env var.
 *
 * Supported providers:
 * - 'mock' (default for dev/test) — deterministic, no external APIs
 * - 'rekognition' — AWS Rekognition (future)
 * - 'insightface' — local InsightFace model (future)
 */

const { MockFaceProvider } = require('./mockFaceProvider');

let _instance = null;

/**
 * Get the configured face provider singleton.
 * @returns {import('./faceProvider.interface').FaceProviderInterface}
 */
function getFaceProvider() {
  if (_instance) return _instance;

  const providerName = process.env.FACE_PROVIDER || 'mock';

  switch (providerName) {
    case 'mock':
      _instance = new MockFaceProvider();
      break;

    // Future providers:
    // case 'rekognition':
    //   _instance = new RekognitionFaceProvider();
    //   break;
    // case 'insightface':
    //   _instance = new InsightFaceFaceProvider();
    //   break;

    default:
      throw new Error(
        `Unknown FACE_PROVIDER: "${providerName}". ` +
        `Supported: mock, rekognition, insightface`
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
