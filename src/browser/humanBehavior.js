function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function humanDelay(minMs = 600, maxMs = 1800) {
  await new Promise((resolve) => setTimeout(resolve, randomBetween(minMs, maxMs)));
}

async function moveMouseNaturally(page) {
  const viewport = page.viewportSize() || { width: 1280, height: 800 };
  const steps = randomBetween(8, 18);
  await page.mouse.move(randomBetween(20, viewport.width - 20), randomBetween(20, viewport.height - 20), { steps });
}

async function randomScroll(page) {
  await page.mouse.wheel(0, randomBetween(180, 650));
  await humanDelay(400, 1300);
}

async function humanType(locator, text) {
  await locator.click();
  for (const char of String(text)) {
    await locator.pressSequentially(char, { delay: randomBetween(35, 115) });
  }
}

async function warmPage(page) {
  await humanDelay();
  await moveMouseNaturally(page);
  await randomScroll(page);
}

module.exports = { randomBetween, humanDelay, moveMouseNaturally, randomScroll, humanType, warmPage };
