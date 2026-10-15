import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getNextProxy } from './proxies.js';

chromium.use(StealthPlugin());

let browser;

/**
 * Initializes the long-lived browser instance.
 * @returns {Promise<import('playwright').Browser>}
 */
export async function initBrowser() {
  if (!browser) {
    console.log('Launching browser in headless mode — no window will open');
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled'
      ]
    });
  }
  return browser;
}

/**
 * Creates a new, non-persistent browser context with a rotating proxy.
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function createContext() {
  if (!browser) {
    await initBrowser();
  }

  const proxy = getNextProxy();
  const options = {
    viewport: { width: 1366, height: 768 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  };

  if (proxy && proxy.server) {
    options.proxy = { server: proxy.server };
  }

  return await browser.newContext(options);
}

/**
 * Closes the specified browser context.
 * @param {import('playwright').BrowserContext} context
 */
export async function closeContext(context) {
  if (context) {
    await context.close();
  }
}

/**
 * Executes a scraping task within a managed context lifecycle.
 * @param {Function} task - An async function that receives the browser context.
 */
export async function scrapeRun(task) {
  const context = await createContext();
  try {
    return await task(context);
  } finally {
    await closeContext(context);
  }
}

/**
 * Closes the global browser instance.
 */
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
