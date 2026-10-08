/**
 * AWS Rekognition Face Provider — paid, managed face recognition.
 * GAP-019: Concrete implementation of FaceProviderInterface.
 * RISK-015: Vendor-specific but behind the provider abstraction.
 *
 * Status: SKELETON — structure ready, not implemented.
 * Activate by setting FACE_PROVIDER=rekognition and providing AWS credentials.
 *
 * AWS Rekognition pricing (as of 2024):
 * - Free tier: 5,000 images/month for first 12 months
 * - After free tier: $0.001 per image (CompareFaces), $0.001 per image (DetectFaces)
 * - IndexFaces (collection): $0.001 per image
 *
 * This provider uses Rekognition Collections for efficient matching:
 * - Each event gets its own Collection (event-scoped, SEC-006)
 * - IndexFaces stores face embeddings in the collection
 * - SearchFacesByImage compares a selfie against the collection
 *
 * Required env vars (when activated):
 * - AWS_ACCESS_KEY_ID (already set for S3)
 * - AWS_SECRET_ACCESS_KEY (already set for S3)
 * - AWS_REGION (already set for S3)
 */

const { FaceProviderInterface } = require('./faceProvider.interface');

class RekognitionFaceProvider extends FaceProviderInterface {
  constructor() {
    super();
    this._dimensions = 128; // Rekognition uses internal embeddings, but we store 128-d externally
    this._client = null;
  }

  /**
   * Initialize the Rekognition client.
   * Lazily loaded to avoid requiring @aws-sdk/client-rekognition unless this provider is active.
   */
  _getClient() {
    if (this._client) return this._client;

    // eslint-disable-next-line no-throw-literal
    throw new Error(
      'AWS Rekognition provider is not yet implemented. ' +
      'Set FACE_PROVIDER=face-api for the free open-source provider, ' +
      'or FACE_PROVIDER=mock for development/testing. ' +
      'To implement Rekognition: install @aws-sdk/client-rekognition and ' +
      'complete the methods in rekognitionFaceProvider.js.'
    );

    // --- FUTURE IMPLEMENTATION ---
    // const { RekognitionClient } = require('@aws-sdk/client-rekognition');
    // this._client = new RekognitionClient({
    //   region: process.env.AWS_REGION || 'ap-south-1',
    //   credentials: {
    //     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    //     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    //   },
    // });
    // return this._client;
  }

  /**
   * Detect faces in an image using AWS Rekognition DetectFaces.
   *
   * FUTURE: Uses DetectFaces API.
   * Cost: $0.001 per image.
   *
   * @param {Buffer} imageBuffer - Raw image data.
   * @returns {Promise<import('./faceProvider.interface').DetectedFace[]>}
   */
  async detectFaces(imageBuffer) {
    this._getClient(); // Will throw "not implemented"

    // --- FUTURE IMPLEMENTATION ---
    // const { DetectFacesCommand } = require('@aws-sdk/client-rekognition');
    // const command = new DetectFacesCommand({
    //   Image: { Bytes: imageBuffer },
    //   Attributes: ['DEFAULT'],
    // });
    // const response = await this._client.send(command);
    //
    // return response.FaceDetails.map((face) => ({
    //   boundingBox: {
    //     x: face.BoundingBox.Left,
    //     y: face.BoundingBox.Top,
    //     width: face.BoundingBox.Width,
    //     height: face.BoundingBox.Height,
    //   },
    //   confidence: face.Confidence / 100,
    //   qualityScore: (face.Quality?.Brightness || 50) / 100,
    // }));
  }

  /**
   * Generate face embedding using AWS Rekognition.
   *
   * FUTURE: Rekognition doesn't expose raw embeddings directly.
   * Instead, use IndexFaces to store faces in a Collection,
   * then SearchFacesByImage for matching.
   *
   * For compatibility with the FaceProviderInterface, we generate
   * a hash-based placeholder and rely on Rekognition's internal
   * matching via Collections.
   *
   * @param {Buffer} faceImageBuffer - Cropped face image data.
   * @returns {Promise<import('./faceProvider.interface').FaceEmbedding>}
   */
  async generateEmbedding(faceImageBuffer) {
    this._getClient(); // Will throw "not implemented"

    // --- FUTURE IMPLEMENTATION ---
    // Rekognition doesn't expose embeddings. Two approaches:
    //
    // Approach A: Use IndexFaces (recommended)
    //   - Store each face in a Rekognition Collection (eventId as collection name)
    //   - Return a placeholder embedding (or the FaceId from Rekognition)
    //   - On search: use SearchFacesByImage against the collection
    //
    // Approach B: Use CompareFaces in a loop (simpler but slower/costlier)
    //   - For each selfie, compare against every photo face
    //   - No embedding storage needed
    //   - Not efficient for large events
    //
    // const { IndexFacesCommand } = require('@aws-sdk/client-rekognition');
    // const collectionId = `event-${eventId}`;
    // const command = new IndexFacesCommand({
    //   CollectionId: collectionId,
    //   Image: { Bytes: faceImageBuffer },
    //   MaxFaces: 1,
    //   QualityFilter: 'AUTO',
    //   DetectionAttributes: ['DEFAULT'],
    // });
    // const response = await this._client.send(command);
    // const faceId = response.FaceRecords[0]?.Face?.FaceId;
    // return { vector: [], dimensions: 0, rekognitionFaceId: faceId };
  }

  /**
   * Compare faces using Rekognition's internal similarity.
   * Not used when Rekognition Collections are used (SearchFacesByImage instead).
   *
   * @param {number[]} embedding1
   * @param {number[]} embedding2
   * @returns {Promise<number>}
   */
  async compareFaces(embedding1, embedding2) {
    this._getClient(); // Will throw "not implemented"

    // --- FUTURE IMPLEMENTATION ---
    // When using Collections, this method isn't needed.
    // SearchFacesByImage returns similarity scores directly.
    //
    // For CompareFaces approach:
    // const { CompareFacesCommand } = require('@aws-sdk/client-rekognition');
    // const command = new CompareFacesCommand({
    //   SourceImage: { Bytes: sourceImageBuffer },
    //   TargetImage: { Bytes: targetImageBuffer },
    //   SimilarityThreshold: 0,
    // });
    // const response = await this._client.send(command);
    // return response.FaceMatches[0]?.Similarity / 100 || 0;
  }

  getProviderName() {
    return 'rekognition';
  }

  getEmbeddingDimensions() {
    return this._dimensions;
  }
}

module.exports = { RekognitionFaceProvider };
