const cron = require("node-cron");
const { runLivePipeline } = require("./pipeline/live");
const { log } = require("./logging/logger");
const { shouldRenewCircuit } = require("./browser/proxies");

log("scheduler.start", { cron: "*/15 * * * *" });

cron.schedule("*/15 * * * *", async () => {
  try {
    await shouldRenewCircuit();
    await runLivePipeline({ limit: 10, prepareApply: false });
  } catch (error) {
    log("scheduler.run.failed", { error: error.message });
  }
});
