/**
 * Event Delete Processor - handles cascade-delete jobs.
 * FR-EVENT-007: Async cascade delete of event data from DB and S3.
 *
 * This processor runs in the worker (Railway), not in the API server (Vercel).
 * It receives jobs from the event-delete queue and calls the shared
 * executeCascadeDelete service function.
 */

const { executeCascadeDelete } = require('../../../server/src/services/eventDelete.service');

/**
 * Process an event cascade delete job.
 * @param {import('bullmq').Job} job
 * @returns {Promise<object>} Delete summary
 */
async function processEventDelete(job) {
  const { tenantId, eventId, eventName, actorUserId } = job.data;

  const startTime = Date.now();
  const summary = await executeCascadeDelete(tenantId, eventId, eventName, actorUserId);
  const durationMs = Date.now() - startTime;

  return { ...summary, durationMs };
}

module.exports = { processEventDelete };
