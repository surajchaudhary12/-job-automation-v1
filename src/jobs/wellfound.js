const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");

async function discoverWellfound({
  query = "backend engineer",
  limit = 10,
} = {}) {
  if (!process.env.LIVE_BROWSER_DISCOVERY) return [];
  const context = await launchPersistentProfile("wellfound");
  const page = await context.newPage();
  const jobs = [];
  try {
    await page.goto(`https://wellfound.com/jobs`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await warmPage(page);
    await humanDelay(1200, 2400);
    // Wellfound discovery is intentionally conservative. The logged-in UI changes often,
    // so this module should be extended with selectors after a manual recording pass.
    console.log(
      `Wellfound session ready for query "${query}" with limit ${limit}.`,
    );
  } finally {
    await context.close();
  }
  return jobs;
}

module.exports = { discoverWellfound };
