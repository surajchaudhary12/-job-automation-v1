const aggregationService = require('../services/aggregationService');
const { log } = require('../../logging/logger');

class AggregationWorker {
  canHandle(task) {
    return task.type === 'AGGREGATE_SOURCE';
  }

  async handle(task) {
    const { sourceId } = task;
    log('worker.aggregation.start', { sourceId });
    
    try {
      await aggregationService.aggregateFromSource(sourceId);
      log('worker.aggregation.success', { sourceId });
    } catch (error) {
      log('worker.aggregation.error', { sourceId, error: error.message });
      throw error;
    }
  }
}

module.exports = new AggregationWorker();
