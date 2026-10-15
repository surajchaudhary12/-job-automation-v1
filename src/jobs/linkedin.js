const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");
const { log } = require("../logging/logger");

async function discoverLinkedIn({
  query = "backend engineer",
  location = "India",
  limit = 10,
  existingContext = null
} = {}) {
  if (!process.env.LIVE_BROWSER_DISCOVERY) return [];

  log("linkedin.discovery.start", { query, location, limit });
  const context = existingContext || await launchPersistentProfile("linkedin", {
    channel: "chrome",
  });
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
      log("linkedin.discovery.failed", {
        reason: "Redirected to login. Session not authenticated.",
      });
      return jobs;
    }

    const captchaText = await page.evaluate(() =>
      document.body.innerText.toLowerCase(),
    );
    if (
      captchaText.includes("security check") ||
      captchaText.includes("captcha")
    ) {
      log("linkedin.discovery.failed", { reason: "Captcha detected." });
      return jobs;
    }

    // Wait for job cards to load
    try {
      await page.waitForSelector(
        ".job-search-card, .jobs-search-results__list-item, [data-occludable-job-id]",
        { timeout: 15000 },
      );
    } catch (e) {
      log("linkedin.discovery.no_jobs", {
        message: "No job cards found within timeout. Taking screenshot.",
      });
      await page.screenshot({ path: `logs/linkedin_discovery_fail_${Date.now()}.png` });
    }

    let previousCount = 0;
    let currentCount = 0;
    let noNewJobsCount = 0;
    const maxNoNewJobs = 3;
    let scrollIterations = 0;

    const cardSelectors = ".job-search-card, .jobs-search-results__list-item, [data-occludable-job-id]";

    while (noNewJobsCount < maxNoNewJobs && currentCount < limit) {
      scrollIterations++;
      currentCount = await page.evaluate(
        (sel) => document.querySelectorAll(sel).length,
        cardSelectors
      );

      log("linkedin.discovery.scroll", {
        iteration: scrollIterations,
        loaded: currentCount,
      });

      if (currentCount >= limit) {
        break;
      }

      if (currentCount === previousCount) {
        noNewJobsCount++;
      } else {
        noNewJobsCount = 0;
      }

      previousCount = currentCount;

      await page.evaluate((sel) => {
        const cards = document.querySelectorAll(sel);
        if (cards.length > 0) {
          cards[cards.length - 1].scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      }, cardSelectors);

      await humanDelay(1500, 2500);
    }

    const cards = await page.$$(cardSelectors);
    log("linkedin.discovery.extracting", { count: Math.min(cards.length, limit) });

    const extractedJobs = [];
    for (let i = 0; i < Math.min(cards.length, limit); i++) {
      const card = cards[i];
      try {
        await card.click();
        await humanDelay(1000, 2000);

        const jobData = await page.evaluate(({index, sel}) => {
          const cardList = document.querySelectorAll(sel);
          const cardEl = cardList[index];
          if (!cardEl) return null;

          const titleEl = cardEl.querySelector(".base-search-card__title, .job-card-list__title, .artdeco-entity-lockup__title, strong, [class*='title']");
          const companyEl = cardEl.querySelector(".base-search-card__subtitle, .job-card-container__company-name, .artdeco-entity-lockup__subtitle, .job-card-container__primary-description, .job-search-card__subtitle, [class*='company']");
          const locationEl = cardEl.querySelector(".job-search-card__location, .job-card-container__metadata-item, .artdeco-entity-lockup__caption");
          const linkEl = cardEl.querySelector(".base-card__full-link, .job-card-list__title a, a.job-card-container__link");

          const jdEl = document.querySelector(".jobs-description__content, .jobs-box__html-content, .show-more-less-html__markup, #job-details");
          
          let title = titleEl ? titleEl.innerText.trim() : "";
          let company = companyEl ? companyEl.innerText.trim() : "";
          
          if (!title || !company) {
             const cardText = cardEl.innerText.split("\n").map(s => s.trim()).filter(s => s.length > 2);
             if (!title && cardText.length > 0) title = cardText[0];
             if (!company && cardText.length > 1) company = cardText[1];
          }

          return {
            title: title || "Unknown Title",
            company: company || "Unknown Company",
            location: locationEl ? locationEl.innerText.trim() : "",
            url: linkEl ? (linkEl.href || linkEl.querySelector('a')?.href) : window.location.href,
            jd: jdEl ? jdEl.innerText.trim() : "",
            source: "linkedin"
          };
        }, {index: i, sel: cardSelectors});

        if (jobData && jobData.url) {
          log("linkedin.extraction.success", { company: jobData.company, title: jobData.title });
          extractedJobs.push(jobData);
        }
      } catch (err) {
        log("linkedin.discovery.card_error", { index: i, error: err.message });
      }
    }

    const FILTER_CONFIG = {
      prioritize: ["backend", "software engineer", "sde", "full stack"],
      reject: [
        "senior",
        "staff",
        "principal",
        "lead",
        "manager",
        "director",
        "marketing",
        "sales",
        "sr ",
        "sr.",
      ],
    };

    const validJobs = [];
    for (const job of extractedJobs) {
      const titleLower = job.title.toLowerCase();
      const rejectMatch = FILTER_CONFIG.reject.find((r) =>
        titleLower.includes(r),
      );

      if (rejectMatch) {
        log("linkedin.discovery.filtered", {
          title: job.title,
          reason: `Matched rejected term: ${rejectMatch}`,
        });
        continue;
      }

      validJobs.push(job);
    }

    validJobs.sort((a, b) => {
      const aTitle = a.title.toLowerCase();
      const bTitle = b.title.toLowerCase();

      const aPriority = FILTER_CONFIG.prioritize.some((p) => aTitle.includes(p))
        ? 1
        : 0;
      const bPriority = FILTER_CONFIG.prioritize.some((p) => bTitle.includes(p))
        ? 1
        : 0;

      return bPriority - aPriority;
    });

    jobs.push(...validJobs.slice(0, limit));
    log("linkedin.discovery.complete", {
      found: extractedJobs.length,
      filtered: extractedJobs.length - validJobs.length,
      returned: jobs.length,
    });
  } catch (error) {
    log("linkedin.discovery.error", { message: error.message });
  } finally {
    await page.close();
    if (!existingContext) await context.close();
  }
  return jobs;
}

module.exports = { discoverLinkedIn };
