const path = require("path");
const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { rootDir, envFlag } = require("../config");
const { getTorProxy } = require("./proxies");

chromium.use(StealthPlugin());

function profilePath(name) {
  return path.join(rootDir(), "profiles", name);
}

async function launchPersistentProfile(name, options = {}) {
  const launchOptions = {
    headless: options.headless ?? envFlag("HEADLESS", true),
    viewport: { width: 1366, height: 850 },
    userAgent: options.userAgent,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox"
    ]
  };

  if (envFlag("USE_PROXY", false)) {
    launchOptions.proxy = getTorProxy();
  }
  if (options.channel || envFlag("USE_REAL_CHROME", false)) launchOptions.channel = options.channel || "chrome";
  
  if (launchOptions.headless) {
    console.log('Launching browser in headless mode — no window will open');
  }
  
  return chromium.launchPersistentContext(profilePath(name), launchOptions);
}

module.exports = { launchPersistentProfile, profilePath };
