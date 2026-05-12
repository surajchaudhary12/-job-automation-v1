const path = require("path");
const { chromium } = require("playwright");
const { rootDir, envFlag } = require("../config");

function profilePath(name) {
  return path.join(rootDir(), "profiles", name);
}

async function launchPersistentProfile(name, options = {}) {
  const launchOptions = {
    headless: options.headless ?? envFlag("HEADLESS", false),
    viewport: { width: 1366, height: 850 },
    userAgent: options.userAgent,
    args: ["--disable-blink-features=AutomationControlled"]
  };
  if (options.channel || envFlag("USE_REAL_CHROME", false)) launchOptions.channel = options.channel || "chrome";
  return chromium.launchPersistentContext(profilePath(name), launchOptions);
}

module.exports = { launchPersistentProfile, profilePath };
