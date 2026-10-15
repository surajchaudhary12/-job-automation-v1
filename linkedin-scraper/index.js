import { initBrowser, closeBrowser } from './browser.js';
import { startApi } from './api.js';
import { runScheduler } from './scheduler.js';

async function main() {
  try {
    await initBrowser();
    startApi();
    
    // Initial delay before first run
    console.log('App started. Initializing scheduler...');
    setTimeout(runScheduler, 5000);

    // Graceful Shutdown
    const shutdown = async () => {
      console.log('\nShutting down...');
      await closeBrowser();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('Fatal startup error:', error);
    process.exit(1);
  }
}

main();
