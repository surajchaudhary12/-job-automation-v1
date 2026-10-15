import { getContext } from './browser.js';
import { dbHelper } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const randomDelay = (min, max) => new Promise(res => setTimeout(res, Math.floor(Math.random() * (max - min + 1)) + min));

/**
 * Performs a human-like scroll in 4 steps with pauses.
 * @param {import('playwright').Page} page
 */
async function humanScroll(page) {
  const totalHeight = await page.evaluate(() => document.body.scrollHeight);
  const stepHeight = totalHeight / 4;
  for (let i = 1; i <= 4; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), stepHeight * i);
    await randomDelay(600, 1500);
  }
}

const queries = (process.env.SEARCH_QUERIES || "software engineer,backend developer,fullstack engineer").split(',').map(q => q.trim());
const location = process.env.SEARCH_LOCATION || "India";
let queryPool = [];

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[array[j]]] = [array[j], array[array[i]]];
  }
  return array;
}

export async function scrapeRun() {
  const context = getContext();
  if (!context) throw new Error('Browser context not initialized');

  const page = await context.newPage();
  
  try {
    if (queryPool.length === 0) {
      queryPool = shuffle([...queries]);
    }
    const query = queryPool.pop();
    
    const url = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&f_TPR=r86400`;
    
    console.log(`[Scraper] Starting run for: "${query}"`);
    
    // Navigate action
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(1200, 3500);
    
    // CAPTCHA Detection
    const content = await page.content();
    const isCaptcha = /captcha|verify you're human/i.test(content);
    if (isCaptcha) {
      console.warn('[Scraper] CAPTCHA detected - cooling down');
      await page.close();
      return { jobsFound: 0, captcha: true };
    }

    // Scroll action
    await humanScroll(page);
    await randomDelay(1200, 3500);

    // Wait for job cards to load
    try {
      await page.waitForSelector('.job-search-card, .base-card', { timeout: 10000 });
      // After job cards load, wait randomDelay(2000, 4000) before extracting data
      await randomDelay(2000, 4000);
    } catch (e) {
      console.warn('[Scraper] Job cards not found within 10s.');
      await page.close();
      return { jobsFound: 0, query };
    }

    const jobCards = await page.locator('.job-search-card, .base-card').all();
    let savedCount = 0;
    const maxToExtract = Math.floor(Math.random() * 2) + 4; // 4-5 jobs

    for (let i = 0; i < Math.min(jobCards.length, maxToExtract); i++) {
      const card = jobCards[i];
      
      const jobId = await card.getAttribute('data-entity-urn') || await card.getAttribute('data-id');
      const cleanJobId = jobId ? jobId.replace(/.*:(\d+)/, '$1') : null;
      
      if (cleanJobId && !dbHelper.isJobExists(cleanJobId)) {
        // Extract action
        const title = await card.locator('.base-search-card__title, .job-search-card__title').innerText().catch(() => 'Unknown');
        const company = await card.locator('.base-search-card__subtitle, .job-search-card__subtitle').innerText().catch(() => 'Unknown');
        const loc = await card.locator('.job-search-card__location').innerText().catch(() => 'Unknown');
        const postedAt = await card.locator('time').innerText().catch(() => 'Unknown');
        const jobUrl = await card.locator('a.base-card__full-link, a.job-search-card__link').getAttribute('href').catch(() => '');
        const snippet = await card.locator('.base-search-card__metadata, .job-search-card__snippet').innerText().catch(() => '');

        dbHelper.saveJob({
          jobId: cleanJobId,
          title: title.trim(),
          company: company.trim(),
          location: loc.trim(),
          postedAt: postedAt.trim(),
          jobUrl: jobUrl.split('?')[0],
          snippet: snippet.trim()
        });

        savedCount++;
        
        // Delay after extract action
        await randomDelay(1200, 3500);
      }
    }

    console.log(`[Scraper] Found ${savedCount} new jobs.`);
    await page.close();
    return { jobsFound: savedCount, query };

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    await page.close().catch(() => {});
    return { error: error.message };
  }
}
