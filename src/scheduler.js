const cron = require("node-cron");
const { runLivePipeline } = require("./pipeline/live");
const { log } = require("./logging/logger");

log("scheduler.start", { cron: "0 */6 * * *" });

cron.schedule("0 */6 * * *", async () => {
  try {
    await runLivePipeline({ limit: 50, prepareApply: false });
  } catch (error) {
    log("scheduler.run.failed", { error: error.message });
  }
});
