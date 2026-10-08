/**
 * Face-API.js Face Provider — real AI face detection & recognition.
 * GAP-019: Concrete implementation of FaceProviderInterface.
 * DEC-002: Uses @vladmandic/face-api (MIT license, free, commercial-safe).
 *
 * Model: SSD MobileNet V1 (detection) + 68-point landmarks + ResNet (128-d embedding).
 * Accuracy: ~99.38% on LFW benchmark.
 * License: MIT — safe for commercial use.
 *
 * Performance notes:
 * - First call loads models (~2-3s). Subsequent calls are fast (~50-200ms per image).
 * - Prefers @tensorflow/tfjs-node (native C++ bindings, ~5x faster).
 * - Falls back to face-api's bundled pure-JS tfjs if native unavailable.
 * - Uses sharp (already a worker dependency) for image decoding when tfjs-node unavailable.
 */

const path = require('path');
const pino = require('pino');
const { FaceProviderInterface } = require('./faceProvider.interface');

const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
});

// Lazy-loaded modules — avoid import-time crashes if tfjs-node has build issues
let faceapi = null;
let tf = null;
let sharp = null;
let _usingNativeTf = false;

/**
 * Initialize TensorFlow.js and face-api.
 * Tries native tfjs-node first (faster), falls back to bundled pure-JS.
 */
function initTf() {
  if (faceapi) return;

  // Try native TensorFlow.js first (5-10x faster inference on Linux/Railway)
  try {
    tf = require('@tensorflow/tfjs-node');
    _usingNativeTf = true;
    logger.info('face-api provider: using @tensorflow/tfjs-node (native, fast)');
  } catch {
    logger.warn('face-api provider: @tensorflow/tfjs-node not available, using pure-JS backend (slower)');
    _usingNativeTf = false;
    // Seamless fallback: alias @tensorflow/tfjs-node to @tensorflow/tfjs
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request, parent, isMain) {
      if (request === '@tensorflow/tfjs-node') {
        try {
          return require('@tensorflow/tfjs');
        } catch {
          // If not directly found, proceed
        }
      }
      return origLoad.apply(this, arguments);
    };
  }

  faceapi = require('@vladmandic/face-api');

  // If we don't have native tf, use face-api's bundled tfjs
  if (!_usingNativeTf) {
    tf = faceapi.tf || require('@tensorflow/tfjs');
    // Also load sharp for image decoding (already a worker dependency)
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('face-api provider requires sharp for image decoding');
    }
  }
}

/**
 * Decode an image buffer to a tf.Tensor3D.
 * Uses tf.node.decodeImage (native) or sharp + manual tensor (pure JS).
 *
 * @param {Buffer} imageBuffer - Raw image file data (JPEG/PNG).
 * @param {number} [maxSide=1600] - Resize large images to prevent OOM.
 * @returns {Promise<import('@tensorflow/tfjs').Tensor3D>}
 */
async function bufferToTensor(imageBuffer, maxSide = 1600) {
  if (_usingNativeTf) {
    // Native path: tf.node.decodeImage handles JPEG/PNG/GIF/BMP
    const decoded = tf.node.decodeImage(imageBuffer, 3);

    // Resize if too large (prevents OOM on 24MP photos)
    const [h, w] = decoded.shape;
    if (Math.max(h, w) > maxSide) {
      const scale = maxSide / Math.max(h, w);
      const newH = Math.round(h * scale);
      const newW = Math.round(w * scale);
      const resized = tf.image.resizeBilinear(decoded, [newH, newW]);
      decoded.dispose();
      return resized;
    }
    return decoded;
  }

  // Pure-JS fallback: use sharp to decode and get raw pixel data
  if (!sharp) throw new Error('sharp is required for image decoding without tfjs-node');

  let pipeline = sharp(imageBuffer).removeAlpha();

  // Get metadata first to check dimensions
  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width || 640;
  const origH = meta.height || 480;

  // Resize if too large
  if (Math.max(origH, origW) > maxSide) {
    const scale = maxSide / Math.max(origH, origW);
    pipeline = pipeline.resize(Math.round(origW * scale), Math.round(origH * scale));
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  return tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3]);
}

class FaceApiFaceProvider extends FaceProviderInterface {
  constructor() {
    super();
    this._dimensions = 128;
    this._modelsLoaded = false;
    this._modelLoadPromise = null;
  }

  /**
   * Load face-api.js models. Called lazily on first use.
   * Models are loaded from the @vladmandic/face-api npm package.
   */
  async _loadModels() {
    if (this._modelsLoaded) return;

    // Deduplicate concurrent model load calls
    if (this._modelLoadPromise) return this._modelLoadPromise;

    this._modelLoadPromise = (async () => {
      initTf();

      // Find model directory inside the npm package
      const faceApiPkgDir = path.dirname(
        require.resolve('@vladmandic/face-api/package.json')
      );
      const modelDir = path.join(faceApiPkgDir, 'model');

      const startTime = Date.now();
      logger.info({ modelDir }, 'Loading face-api.js models...');

      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir),
        faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir),
        faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir),
      ]);

      const durationMs = Date.now() - startTime;
      logger.info(
        { durationMs, backend: _usingNativeTf ? 'tfjs-node' : 'tfjs-pure-js' },
        'Face-api.js models loaded successfully'
      );

      this._modelsLoaded = true;
    })();

    return this._modelLoadPromise;
  }

  /**
   * Detect faces in an image.
   * Returns bounding boxes, confidence scores, and quality scores.
   *
   * @param {Buffer} imageBuffer - Raw image data (JPEG/PNG).
   * @returns {Promise<import('./faceProvider.interface').DetectedFace[]>}
   */
  async detectFaces(imageBuffer) {
    await this._loadModels();

    const tensor = await bufferToTensor(imageBuffer);
    try {
      const detections = await faceapi.detectAllFaces(
        tensor,
        new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
      );

      const [imgH, imgW] = tensor.shape;

      return detections.map((d) => ({
        boundingBox: {
          x: d.box.x / imgW,
          y: d.box.y / imgH,
          width: d.box.width / imgW,
          height: d.box.height / imgH,
        },
        confidence: d.score,
        qualityScore: d.score, // Use detection confidence as quality proxy
      }));
    } finally {
      tensor.dispose();
    }
  }

  /**
   * Generate a 128-dimensional face embedding from a cropped face image.
   * Runs full pipeline: detect face → landmarks → descriptor.
   *
   * @param {Buffer} faceImageBuffer - Cropped face image data.
   * @returns {Promise<import('./faceProvider.interface').FaceEmbedding>}
   */
  async generateEmbedding(faceImageBuffer) {
    await this._loadModels();

    const tensor = await bufferToTensor(faceImageBuffer, 800);
    try {
      // Run full pipeline on the cropped face
      const result = await faceapi
        .detectSingleFace(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!result) {
        // If face detection fails on the crop (can happen with tight crops),
        // try with lower confidence threshold
        const retryResult = await faceapi
          .detectSingleFace(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (!retryResult) {
          throw new Error('No face detected in the provided image crop');
        }

        return {
          vector: Array.from(retryResult.descriptor),
          dimensions: this._dimensions,
        };
      }

      return {
        vector: Array.from(result.descriptor),
        dimensions: this._dimensions,
      };
    } finally {
      tensor.dispose();
    }
  }

  /**
   * Compare two face embeddings via Euclidean distance, mapped to 0-1 similarity.
   * face-api.js uses Euclidean distance; typical threshold ~0.6 (distance).
   * We convert to similarity: sim = max(0, 1 - distance/2) for 0-1 range.
   *
   * @param {number[]} embedding1 - First face embedding vector (128-d).
   * @param {number[]} embedding2 - Second face embedding vector (128-d).
   * @returns {Promise<number>} Similarity score 0-1 (1 = identical).
   */
  async compareFaces(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embedding dimensions must match');
    }

    // Euclidean distance
    let sumSq = 0;
    for (let i = 0; i < embedding1.length; i++) {
      const diff = embedding1[i] - embedding2[i];
      sumSq += diff * diff;
    }
    const distance = Math.sqrt(sumSq);

    // Convert distance to similarity (0-1 range)
    // face-api.js typical distances: <0.4 = same person, >0.6 = different
    // Max possible distance for unit vectors ≈ 2.0
    const similarity = Math.max(0, Math.min(1, 1 - distance / 2));
    return similarity;
  }

  getProviderName() {
    return 'face-api';
  }

  getEmbeddingDimensions() {
    return this._dimensions;
  }
}

module.exports = { FaceApiFaceProvider };
