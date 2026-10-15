// Using src/logging/logger.js
const { log: appLog } = require('../../logging/logger');

class AggregationQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.workers = [];
  }

  async add(task) {
    this.queue.push(task);
    appLog('queue.task.added', { type: task.type, sourceId: task.sourceId });
    this.process();
  }

  async process() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift();
      appLog('queue.task.start', { type: task.type, sourceId: task.sourceId });
      
      try {
        for (const worker of this.workers) {
          if (worker.canHandle(task)) {
            await worker.handle(task);
            break;
          }
        }
        appLog('queue.task.complete', { type: task.type, sourceId: task.sourceId });
      } catch (error) {
        appLog('queue.task.failed', { type: task.type, sourceId: task.sourceId, error: error.message });
      }
    }
    this.isProcessing = false;
  }

  registerWorker(worker) {
    this.workers.push(worker);
  }
}

module.exports = new AggregationQueue();
