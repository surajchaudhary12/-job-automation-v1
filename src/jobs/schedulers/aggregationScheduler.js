const cron = require('node-cron');
const prisma = require('../../db/prisma');
const aggregationQueue = require('../queues/aggregationQueue');
const aggregationWorker = require('../workers/aggregationWorker');
const { log } = require('../../logging/logger');

// Register the worker
aggregationQueue.registerWorker(aggregationWorker);

class AggregationScheduler {
  constructor() {
    this.jobs = [];
  }

  start() {
    log('scheduler.aggregation.start', { message: 'Aggregation scheduler initialized' });

    // Run every 6 hours
    const task = cron.schedule('0 */6 * * *', async () => {
      log('scheduler.aggregation.run', { ts: new Date().toISOString() });
      await this.scheduleEnabledSources();
    });

    this.jobs.push(task);
  }

  async scheduleEnabledSources() {
    try {
      const sources = await prisma.jobSource.findMany({
        where: { isEnabled: true },
      });

      log('scheduler.aggregation.scheduling', { count: sources.length });

      for (const source of sources) {
        await aggregationQueue.add({
          type: 'AGGREGATE_SOURCE',
          sourceId: source.id,
        });
      }
    } catch (error) {
      log('scheduler.aggregation.error', { error: error.message });
    }
  }

  stop() {
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
  }
}

module.exports = new AggregationScheduler();
