const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");
const { log } = require("../logging/logger");

async function discoverInstahyre({
  query = "backend engineer",
  limit = 10,
  existingContext = null
} = {}) {
  if (!process.env.LIVE_BROWSER_DISCOVERY) return [];

  log("instahyre.discovery.start", { query, limit });
  const context = existingContext || await launchPersistentProfile("instahyre");
  const page = await context.newPage();
  const jobs = [];

  try {
    const searchUrl = `https://www.instahyre.com/search-jobs/`;
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await warmPage(page);
    await humanDelay(2000, 4000);

    const currentUrl = page.url();
    if (currentUrl.includes("login")) {
        log("instahyre.discovery.failed", { reason: "Redirected to login." });
        return jobs;
    }

    // Instahyre search might require interaction if query is passed, 
    // but usually, it shows "Recommended for you" or you can filter.
    // For now, let's assume we extract what's on the page or try to search if possible.
    
    const listingSelector = '.job-listing, .opportunity, .job-card';
    try {
      await page.waitForSelector(listingSelector, { timeout: 20000 });
    } catch (e) {
      log("instahyre.discovery.no_listings", { message: "Timeout waiting for listings." });
    }

    const extracted = await page.evaluate((sel) => {
      const items = Array.from(document.querySelectorAll(sel));
      return items.map(el => {
        const titleEl = el.querySelector(".job-title, h2, h4, [class*=\"title\"]");
        const companyEl = el.querySelector(".company-name, h3, h5, [class*=\"company\"]");
        const locationEl = el.querySelector(".job-location, .location");
        const linkEl = el.querySelector("a[href*=\"/job-\"]");
        const jdEl = el.querySelector(".job-description, .job-skills, .tags");

        return {
          title: titleEl ? titleEl.innerText.trim() : "Unknown Title",
          company: companyEl ? companyEl.innerText.trim() : "Unknown Company",
          location: locationEl ? locationEl.innerText.trim() : "",
          url: linkEl ? linkEl.href : "",
          jd: jdEl ? jdEl.innerText.trim() : "",
          source: "instahyre"
        };
      }).filter(j => j.url && !j.company.includes("Jobs"));
    }, listingSelector);

    extracted.forEach(job => log("instahyre.extraction.success", { company: job.company, title: job.title }));
    jobs.push(...extracted.slice(0, limit));
    log("instahyre.discovery.complete", { found: extracted.length, returned: jobs.length });
  } catch (error) {
    log("instahyre.discovery.error", { message: error.message });
  } finally {
    await page.close();
    if (!existingContext) await context.close();
  }
  return jobs;
}

module.exports = { discoverInstahyre };
