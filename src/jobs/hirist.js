const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");
const { log } = require("../logging/logger");

async function discoverHirist({
  query = "backend engineer",
  limit = 10,
  existingContext = null
} = {}) {
  if (!process.env.LIVE_BROWSER_DISCOVERY) return [];

  log("hirist.discovery.start", { query, limit });
  const context = existingContext || await launchPersistentProfile("hirist");
  const page = await context.newPage();
  const jobs = [];

  try {
    // Hirist search URL
    const searchUrl = `https://www.hirist.tech/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await warmPage(page);
    await humanDelay(2000, 4000);

    const currentUrl = page.url();
    log("hirist.discovery.url", { url: currentUrl });

    // Wait for job cards
    const listingSelector = '.job-box, [class*="jobBox"], .job-card';
    try {
      await page.waitForSelector(listingSelector, { timeout: 15000 });
    } catch (e) {
      log("hirist.discovery.no_listings", { message: "Timeout waiting for listings." });
      return jobs;
    }

    const extracted = await page.evaluate((sel) => {
      const items = Array.from(document.querySelectorAll(sel));
      return items.map(el => {
        const titleEl = el.querySelector(".job-title, h2, h3, [class*=\"title\"]");
        const companyEl = el.querySelector(".company-name, .recruiter-name, [class*=\"company\"]");
        const locationEl = el.querySelector(".job-location, .location");
        const linkEl = el.querySelector("a[href*=\"/j/\"], a[href*=\"hirist.tech/j/\"]");
        const jdEl = el.querySelector(".job-description, .job-skills, [class*=\"description\"]");

        return {
          title: titleEl ? titleEl.innerText.trim() : "Unknown Title",
          company: companyEl ? companyEl.innerText.trim() : "Unknown Company",
          location: locationEl ? locationEl.innerText.trim() : "",
          url: linkEl ? linkEl.href : "",
          jd: jdEl ? jdEl.innerText.trim() : "",
          source: "hirist"
        };
      }).filter(j => j.url && j.title !== "Unknown Title");
    }, listingSelector);

    extracted.forEach(job => log("hirist.extraction.success", { company: job.company, title: job.title }));
    jobs.push(...extracted.slice(0, limit));
    log("hirist.discovery.complete", { found: extracted.length, returned: jobs.length });
  } catch (error) {
    log("hirist.discovery.error", { message: error.message });
  } finally {
    await page.close();
    if (!existingContext) await context.close();
  }
  return jobs;
}

module.exports = { discoverHirist };
