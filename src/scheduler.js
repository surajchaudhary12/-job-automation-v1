const cron = require("node-cron");
const { runLivePipeline } = require("./pipeline/live");
const { envFlag, applicationPreferences } = require("./config");
const { log } = require("./logging/logger");
const { shouldRenewCircuit } = require("./browser/proxies");

log("scheduler.start", { cron: "*/15 * * * *" });

cron.schedule("*/15 * * * *", async () => {
  try {
    await shouldRenewCircuit();
    const scheduledApplyEnabled = applicationPreferences().scheduled_auto_apply_enabled === true;
    const prepareApply = scheduledApplyEnabled || envFlag("LIVE_APPLY", false);
    const autoSubmit = scheduledApplyEnabled || (prepareApply && envFlag("AUTO_SUBMIT", false));
    await runLivePipeline({ limit: 10, prepareApply, autoSubmit });
  } catch (error) {
    log("scheduler.run.failed", { error: error.message });
  }
});
