/**
 * Face-API.js Face Provider — server-side copy for selfie processing.
 * GAP-019: Concrete implementation of FaceProviderInterface.
 *
 * This is used in guest.service.js to:
 * 1. Validate exactly 1 face in selfie (FR-SELFIE-003)
 * 2. Generate embedding from selfie (FR-SELFIE-004)
 *
 * Uses face-api's bundled pure-JS TensorFlow.js + sharp for image decoding.
 * No native C++ dependencies — works on Vercel serverless.
 *
 * Model loading is cached in-memory — warm Vercel instances reuse loaded models.
 */

const path = require('path');
const { FaceProviderInterface } = require('./faceProvider.interface');

let faceapi = null;
let tf = null;
let sharp = null;
let _usingNativeTf = false;

function initTf() {
  if (faceapi) return;

  // Try native TensorFlow.js first (faster on Railway/Linux)
  try {
    tf = require('@tensorflow/tfjs-node');
    _usingNativeTf = true;
  } catch {
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

  if (!_usingNativeTf) {
    tf = faceapi.tf || require('@tensorflow/tfjs');
    try {
      sharp = require('sharp');
    } catch {
      throw new Error('face-api provider requires sharp for image decoding');
    }
  }
}

/**
 * Decode image buffer to tensor.
 * @param {Buffer} imageBuffer
 * @param {number} [maxSide=800] - Smaller default for selfies
 * @returns {Promise<import('@tensorflow/tfjs').Tensor3D>}
 */
async function bufferToTensor(imageBuffer, maxSide = 800) {
  if (_usingNativeTf) {
    const decoded = tf.node.decodeImage(imageBuffer, 3);
    const [h, w] = decoded.shape;
    if (Math.max(h, w) > maxSide) {
      const scale = maxSide / Math.max(h, w);
      const resized = tf.image.resizeBilinear(decoded, [Math.round(h * scale), Math.round(w * scale)]);
      decoded.dispose();
      return resized;
    }
    return decoded;
  }

  // Pure-JS fallback via sharp
  if (!sharp) throw new Error('sharp required for image decoding');
  let pipeline = sharp(imageBuffer).removeAlpha();
  const meta = await sharp(imageBuffer).metadata();
  const origW = meta.width || 640;
  const origH = meta.height || 480;
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

  async _loadModels() {
    if (this._modelsLoaded) return;
    if (this._modelLoadPromise) return this._modelLoadPromise;

    this._modelLoadPromise = (async () => {
      initTf();
      const faceApiPkgDir = path.dirname(
        require.resolve('@vladmandic/face-api/package.json')
      );
      const modelDir = path.join(faceApiPkgDir, 'model');

      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromDisk(modelDir),
        faceapi.nets.faceLandmark68Net.loadFromDisk(modelDir),
        faceapi.nets.faceRecognitionNet.loadFromDisk(modelDir),
      ]);

      this._modelsLoaded = true;
    })();

    return this._modelLoadPromise;
  }

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
        qualityScore: d.score,
      }));
    } finally {
      tensor.dispose();
    }
  }

  async generateEmbedding(faceImageBuffer) {
    await this._loadModels();
    const tensor = await bufferToTensor(faceImageBuffer, 800);
    try {
      let result = await faceapi
        .detectSingleFace(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!result) {
        result = await faceapi
          .detectSingleFace(tensor, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.1 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
      }

      if (!result) {
        throw new Error('No face detected in the provided image');
      }

      return {
        vector: Array.from(result.descriptor),
        dimensions: this._dimensions,
      };
    } finally {
      tensor.dispose();
    }
  }

  async compareFaces(embedding1, embedding2) {
    if (embedding1.length !== embedding2.length) {
      throw new Error('Embedding dimensions must match');
    }
    let sumSq = 0;
    for (let i = 0; i < embedding1.length; i++) {
      const diff = embedding1[i] - embedding2[i];
      sumSq += diff * diff;
    }
    const distance = Math.sqrt(sumSq);
    return Math.max(0, Math.min(1, 1 - distance / 2));
  }

  getProviderName() {
    return 'face-api';
  }

  getEmbeddingDimensions() {
    return this._dimensions;
  }
}

module.exports = { FaceApiFaceProvider };
