const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");
const { log } = require("../logging/logger");

async function discoverLinkedIn({ query = "backend engineer", location = "India", limit = 10 } = {}) {
  if (!process.env.LIVE_BROWSER_DISCOVERY) return [];
  
  log("linkedin.discovery.start", { query, location, limit });
  const context = await launchPersistentProfile("linkedin", { channel: "chrome" });
  const page = await context.newPage();
  const jobs = [];
  
  try {
    const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await warmPage(page);
    await humanDelay(1500, 3000);
    
    const currentUrl = page.url();
    log("linkedin.discovery.url", { expected: url, actual: currentUrl });
    
    if (currentUrl.includes("login") || currentUrl.includes("signup")) {
      log("linkedin.discovery.failed", { reason: "Redirected to login. Session not authenticated." });
      return jobs;
    }
    
    const captchaText = await page.evaluate(() => document.body.innerText.toLowerCase());
    if (captchaText.includes("security check") || captchaText.includes("captcha")) {
      log("linkedin.discovery.failed", { reason: "Captcha detected." });
      return jobs;
    }

    // Wait for job cards to load
    try {
        await page.waitForSelector('.job-search-card, .jobs-search-results__list-item', { timeout: 10000 });
    } catch (e) {
        log("linkedin.discovery.no_jobs", { message: "No job cards found within timeout." });
    }

    let previousCount = 0;
    let currentCount = 0;
    let noNewJobsCount = 0;
    const maxNoNewJobs = 3;

    while (noNewJobsCount < maxNoNewJobs) {
        currentCount = await page.evaluate(() => document.querySelectorAll('.job-search-card, .jobs-search-results__list-item').length);
        
        log("linkedin.discovery.scroll", { loaded: currentCount });
        
        if (currentCount >= limit) {
            break;
        }

        if (currentCount === previousCount) {
            noNewJobsCount++;
        } else {
            noNewJobsCount = 0;
        }

        previousCount = currentCount;

        // Scroll incrementally
        await page.evaluate(() => {
            const step = Math.floor(Math.random() * 400) + 300;
            window.scrollBy({ top: step, behavior: 'smooth' });
            
            const listContainer = document.querySelector('.jobs-search-results-list');
            if (listContainer) {
                listContainer.scrollBy({ top: step, behavior: 'smooth' });
            }
        });

        await humanDelay(800, 1500);
    }

    // Simple evaluation to get job data. Handles both guest and logged-in layouts roughly
    const extractedJobs = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.job-search-card, .jobs-search-results__list-item'));
        return cards.map(card => {
            const titleEl = card.querySelector('.base-search-card__title, .job-card-list__title');
            const companyEl = card.querySelector('.base-search-card__subtitle, .job-card-container__company-name');
            const locationEl = card.querySelector('.job-search-card__location, .job-card-container__metadata-item');
            const linkEl = card.querySelector('.base-card__full-link, .job-card-list__title');
            
            return {
                title: titleEl ? titleEl.innerText.trim() : 'Unknown Title',
                company: companyEl ? companyEl.innerText.trim() : 'Unknown Company',
                location: locationEl ? locationEl.innerText.trim() : '',
                url: linkEl ? linkEl.href : '',
                source: 'linkedin',
                jd: '' // JD requires further clicking, skipping for basic discovery
            };
        }).filter(j => j.url);
    });

    // Lightweight post-scrape filtering configuration for 1-2 years experience
    const FILTER_CONFIG = {
        prioritize: ["backend", "software engineer", "sde", "full stack"],
        reject: ["senior", "staff", "principal", "lead", "manager", "director", "marketing", "sales", "sr ", "sr."]
    };

    const validJobs = [];
    for (const job of extractedJobs) {
        const titleLower = job.title.toLowerCase();
        const rejectMatch = FILTER_CONFIG.reject.find(r => titleLower.includes(r));
        
        if (rejectMatch) {
            log("linkedin.discovery.filtered", { title: job.title, reason: `Matched rejected term: ${rejectMatch}` });
            continue;
        }
        
        validJobs.push(job);
    }

    // Sort valid jobs: Prioritized roles first
    validJobs.sort((a, b) => {
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        
        const aPriority = FILTER_CONFIG.prioritize.some(p => aTitle.includes(p)) ? 1 : 0;
        const bPriority = FILTER_CONFIG.prioritize.some(p => bTitle.includes(p)) ? 1 : 0;
        
        return bPriority - aPriority; // 1 (higher priority) comes before 0
    });

    jobs.push(...validJobs.slice(0, limit));
    log("linkedin.discovery.complete", { found: extractedJobs.length, filtered: extractedJobs.length - validJobs.length, returned: jobs.length });

  } catch (error) {
    log("linkedin.discovery.error", { message: error.message });
  } finally {
    await context.close();
  }
  return jobs;
}

module.exports = { discoverLinkedIn };
