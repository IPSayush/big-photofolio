/**
 * Test setup — runs before all test files.
 * 
 * Sets up test environment variables and MongoDB connection.
 * Uses in-memory MongoDB via mongodb-memory-server for isolation.
 */

// Use MongoDB 7.0 — much smaller binary (~130MB vs 781MB for 8.x)
process.env.MONGOMS_VERSION = '7.0.0';
process.env.MONGOMS_DOWNLOAD_TIMEOUT = '300000'; // 5 min download timeout

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongoServer;

// Set test environment variables before importing app code
process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-for-testing-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.API_URL = 'http://localhost:5000';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
process.env.RAZORPAY_KEY_SECRET = 'test-razorpay-secret';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  process.env.MONGODB_URI = uri;
  await mongoose.connect(uri);
}, 120000); // 2 min timeout for beforeAll (binary download on first run)

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);

afterEach(async () => {
  // Clean all collections between tests for isolation
  if (mongoose.connection.readyState === 1) {
    const collections = Object.keys(mongoose.connection.collections);
    for (const collectionName of collections) {
      await mongoose.connection.collections[collectionName].deleteMany({});
    }
  }
});
