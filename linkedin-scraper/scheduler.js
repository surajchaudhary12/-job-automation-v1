import { scrapeRun } from './scraper.js';
import { dbHelper } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const BASE_INTERVAL = 1200000; // 20 minutes
const JITTER_MAX = 300000;    // 5 minutes
const DAILY_CAP = 80;

/**
 * Checks if the current local time is between 23:00 and 07:00.
 * @returns {boolean} True if in night pause period.
 */
function isNightPause() {
  const hour = new Date().getHours();
  return hour >= 23 || hour < 7;
}

let nextIntervalMultiplier = 1;

/**
 * Main scheduler loop.
 */
export async function runScheduler() {
  const now = new Date();
  
  // 1. Night Pause (23:00 - 07:00)
  if (isNightPause()) {
    const nextCheck = 1800000; // Check every 30 mins during night pause
    console.log(`[${now.toLocaleString()}] Night pause active. Next check at: ${new Date(Date.now() + nextCheck).toLocaleString()}`);
    scheduleNext(nextCheck);
    return;
  }

  // 2. Daily Cap (80 jobs)
  // Counter resets naturally as dbHelper.getTodayScrapeCount() depends on local date
  const todayJobs = dbHelper.getTodayScrapeCount();
  if (todayJobs >= DAILY_CAP) {
    const nextCheck = 3600000; // Check every hour once cap is hit
    console.log(`[${now.toLocaleString()}] Daily cap (${DAILY_CAP} jobs) reached. Next check at: ${new Date(Date.now() + nextCheck).toLocaleString()}`);
    scheduleNext(nextCheck);
    return;
  }

  // Execute Scrape Run
  const result = await scrapeRun();
  
  const jobsFound = result.jobsFound || 0;
  const queryUsed = result.query || 'N/A';
  
  // Calculate Next Interval
  let baseWithJitter = BASE_INTERVAL + Math.floor(Math.random() * JITTER_MAX);
  let nextInterval = baseWithJitter * nextIntervalMultiplier;

  // Reset multiplier for next time (double only once per CAPTCHA detection)
  nextIntervalMultiplier = 1;

  if (result.captcha) {
    nextIntervalMultiplier = 2; // This run had a captcha, so the NEXT interval is doubled
    // Wait, requirement: "If scrapeRun returns captcha: true, double the next interval once"
    // So the interval we just calculated for the NEXT run should be doubled.
    nextInterval = baseWithJitter * 2;
  }

  const nextRunTime = new Date(Date.now() + nextInterval);

  // Log run details
  console.log(`[${now.toLocaleString()}] Run complete. Query: "${queryUsed}", Jobs Found: ${jobsFound}. Next run at: ${nextRunTime.toLocaleString()}`);

  scheduleNext(nextInterval);
}

/**
 * Helper to wrap setTimeout.
 * @param {number} ms 
 */
function scheduleNext(ms) {
  setTimeout(runScheduler, ms);
}
