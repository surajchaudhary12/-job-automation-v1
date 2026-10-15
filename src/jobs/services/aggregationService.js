const prisma = require('../../db/prisma');
const { JobSchema } = require('../utils/validation');
const { log } = require('../../logging/logger');
const greenhouseAdapter = require('../adapters/GreenhouseAdapter');
const leverAdapter = require('../adapters/LeverAdapter');

class AggregationService {
  constructor() {
    this.adapters = {
      greenhouse: greenhouseAdapter,
      lever: leverAdapter,
    };
  }

  async aggregateFromSource(sourceId) {
    const source = await prisma.jobSource.findUnique({
      where: { id: sourceId },
    });

    if (!source || !source.isEnabled) {
      log('aggregation.skip', { sourceId, reason: 'Source disabled or not found' });
      return;
    }

    const adapter = this.adapters[source.type.toLowerCase()];
    if (!adapter) {
      log('aggregation.error', { sourceId, type: source.type, reason: 'No adapter found for type' });
      return;
    }

    log('aggregation.start', { source: source.name, type: source.type });

    try {
      const jobs = await adapter.fetchJobs(source);
      log('aggregation.fetched', { source: source.name, count: jobs.length });

      let savedCount = 0;
      for (const jobData of jobs) {
        try {
          await this.saveJob(jobData);
          savedCount++;
        } catch (error) {
          // Individual job save failures don't stop the whole process
          continue;
        }
      }

      await prisma.jobSource.update({
        where: { id: sourceId },
        data: { lastFetched: new Date() },
      });

      log('aggregation.complete', { source: source.name, saved: savedCount });
    } catch (error) {
      log('aggregation.failed', { source: source.name, error: error.message });
      throw error;
    }
  }

  async saveJob(jobData) {
    try {
      const validated = JobSchema.parse(jobData);
      const job = await prisma.job.upsert({
        where: { url: validated.url },
        update: { ...validated },
        create: { ...validated },
      });
      return job;
    } catch (error) {
      log('aggregation.save.error', { url: jobData.url, error: error.message });
      throw error;
    }
  }

  async listSources() {
    return prisma.jobSource.findMany();
  }
}

module.exports = new AggregationService();
