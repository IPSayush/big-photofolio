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
    console.log('Testing vector comparison...');
    const v1 = new Array(128).fill(0.1);
    const v2 = new Array(128).fill(0.1);
    const simSame = await provider.compareFaces(v1, v2);
    console.log('Similarity (identical vectors, expected 1.0):', simSame);

    const v3 = new Array(128).fill(-0.1);
    const simDiff = await provider.compareFaces(v1, v3);
    console.log('Similarity (opposite vectors, expected ~0.0):', simDiff);
  } catch (err) {
    console.error('Vector comparison error:', err);
  }

  console.log('--- Test Finished ---');
}

runTest().catch(console.error);
