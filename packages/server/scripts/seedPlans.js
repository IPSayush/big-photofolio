require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const Plan = require('../src/models/Plan');

const plans = [
  {
    name: 'Free Trial',
    description: 'Perfect to test out PhotoFolio features',
    pricing: { amount: 0, currency: 'INR', interval: 'monthly' },
    quotas: {
      maxEvents: 2,
      maxPhotosPerEvent: 100,
      maxStorageBytes: 2 * 1024 * 1024 * 1024, // 2 GB
      maxGuestsPerEvent: 50,
      maxAiMatchesPerMonth: 100,
    },
    features: {
      originalDownload: false,
      customBranding: false,
      watermarkRemoval: false,
      priorityProcessing: false,
    },
    trialDays: 14,
    retentionDefaults: { faceDataRetentionDays: 30, eventPhotoRetentionDays: 90 },
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Pro Photographer',
    description: 'For active event & wedding photographers',
    pricing: { amount: 1499, currency: 'INR', interval: 'monthly' },
    quotas: {
      maxEvents: 15,
      maxPhotosPerEvent: 2000,
      maxStorageBytes: 50 * 1024 * 1024 * 1024, // 50 GB
      maxGuestsPerEvent: 500,
      maxAiMatchesPerMonth: 2000,
    },
    features: {
      originalDownload: true,
      customBranding: true,
      watermarkRemoval: true,
      priorityProcessing: true,
    },
    trialDays: 0,
    retentionDefaults: { faceDataRetentionDays: 90, eventPhotoRetentionDays: 365 },
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Studio Enterprise',
    description: 'Unlimited scale for high-volume studios',
    pricing: { amount: 3999, currency: 'INR', interval: 'monthly' },
    quotas: {
      maxEvents: 50,
      maxPhotosPerEvent: 5000,
      maxStorageBytes: 200 * 1024 * 1024 * 1024, // 200 GB
      maxGuestsPerEvent: 2000,
      maxAiMatchesPerMonth: 10000,
    },
    features: {
      originalDownload: true,
      customBranding: true,
      watermarkRemoval: true,
      priorityProcessing: true,
    },
    trialDays: 0,
    retentionDefaults: { faceDataRetentionDays: 180, eventPhotoRetentionDays: 730 },
    isActive: true,
    sortOrder: 3,
  },
];

async function seed() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not found in environment!');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri);

  for (const p of plans) {
    await Plan.findOneAndUpdate(
      { name: p.name },
      { $set: p },
      { upsert: true, new: true }
    );
    console.log(`✅ Seeded/Updated plan: ${p.name}`);
  }

  console.log('🎉 All plans seeded successfully!');
  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
