const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");
const { log } = require("../logging/logger");

async function discoverWellfound({
  query = "backend engineer",
  limit = 10,
  existingContext = null
} = {}) {
  if (!process.env.LIVE_BROWSER_DISCOVERY) return [];

  log("wellfound.discovery.start", { query, limit });
  const context = existingContext || await launchPersistentProfile("wellfound");
  const page = await context.newPage();
  const jobs = [];

  try {
    const searchUrl = `https://wellfound.com/jobs`;
    await page.goto(searchUrl, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await warmPage(page);
    await humanDelay(3000, 6000);

    const currentUrl = page.url();
    log("wellfound.discovery.url", { url: currentUrl });
    
    const pageTitle = await page.title();
    const content = await page.content();
    const pageText = await page.evaluate(() => document.body.innerText.toLowerCase());
    log("wellfound.discovery.page_info", { 
        title: pageTitle, 
        contentLength: content.length,
        textLength: pageText.length,
        contentSample: content.substring(0, 1000)
    });

    if (currentUrl.includes("login") || pageText.includes("log in to") || pageText.includes("sign in")) {
        log("wellfound.discovery.failed", { reason: "Redirected to login or login required." });
        return jobs;
    }

    if (pageText.includes("checking your browser") || pageText.includes("verify you are human") || pageTitle.includes("Cloudflare")) {
        log("wellfound.discovery.failed", { reason: "Cloudflare/Captcha detected." });
        await page.screenshot({ path: `logs/wellfound_blocked_${Date.now()}.png` });
        return jobs;
    }

    const listingSelector = '[data-test="JobListing"], .styles_jobListing__, [class*="JobListing"], .styles_result__, .styles_component__ [class*="result"], .styles_jobCard__';
    try {
      await page.waitForSelector(listingSelector, { timeout: 15000 });
    } catch (e) {
      log("wellfound.discovery.no_listings", { message: "Timeout waiting for listings. Taking debug screenshot." });
      await page.screenshot({ path: `logs/wellfound_debug_${Date.now()}.png`, fullPage: true });
      return jobs;
    }

    const extracted = await page.evaluate((sel) => {
      const items = Array.from(document.querySelectorAll(sel));
      return items.map(el => {
        const titleEl = el.querySelector("h3, .styles_title__, [class*=\"title\"], [class*=\"jobTitle\"]");
        const companyEl = el.querySelector(".styles_companyName__, [class*=\"companyName\"], [class*=\"company\"], .styles_header__ a");
        const linkEl = el.querySelector("a[href*=\"/jobs/\"], a[href*=\"/l/jobs/\"], .styles_applyButton__ a");
        const jdEl = el.querySelector(".styles_description__, [class*=\"description\"], .styles_jobDescription__");

        let company = companyEl ? companyEl.innerText.trim() : "";
        if (!company && el.querySelector('img[alt]')) {
            company = el.querySelector('img[alt]').alt.replace(' logo', '');
        }

        return {
          title: titleEl ? titleEl.innerText.trim() : "Unknown Title",
          company: company || "Unknown Company",
          url: linkEl ? linkEl.href : "",
          jd: jdEl ? jdEl.innerText.trim() : "",
          source: "wellfound"
        };
      }).filter(j => j.url && j.title !== "Unknown Title");
    }, listingSelector);

    extracted.forEach(job => log("wellfound.extraction.success", { company: job.company, title: job.title }));
    jobs.push(...extracted.slice(0, limit));
    log("wellfound.discovery.complete", { found: extracted.length, returned: jobs.length });
  } catch (error) {
    log("wellfound.discovery.error", { message: error.message });
  } finally {
    await page.close();
    if (!existingContext) await context.close();
  }
  return jobs;
}

module.exports = { discoverWellfound };
