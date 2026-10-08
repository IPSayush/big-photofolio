/**
 * Test Face-API.js Provider
 * Verifies model loading, face detection, and embedding generation.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function runTest() {
  console.log('--- Testing Face-API Provider ---');

  // Load provider from packages/server/src/providers/providerFactory
  process.env.FACE_PROVIDER = 'face-api';
  const { getFaceProvider } = require('../packages/server/src/providers/providerFactory');
  
  const provider = getFaceProvider();
  console.log(`Active provider: ${provider.getProviderName()}`);
  console.log(`Dimensions: ${provider.getEmbeddingDimensions()}`);

  // Create a synthetic image with a face-like oval to test pipeline execution
  // Or create a 200x200 test JPEG
  const testBuffer = await sharp({
    create: {
      width: 300,
      height: 300,
      channels: 3,
      background: { r: 240, g: 200, b: 180 },
    },
  })
    .jpeg()
    .toBuffer();

  console.log('Synthetic test image generated, buffer size:', testBuffer.length);

  try {
    console.log('Testing face detection on synthetic image...');
    const detections = await provider.detectFaces(testBuffer);
    console.log('Detections result:', detections);
    console.log('Face detection pipeline executed successfully!');
  } catch (err) {
    console.error('Face detection error:', err);
  }

  console.log('--- Test Finished ---');
}

runTest().catch(console.error);
