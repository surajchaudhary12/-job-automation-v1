const { launchPersistentProfile } = require("../src/browser/session");
const { recordLoginStart, recordLoginConfirmed, recordLoginFailure } = require("../src/browser/sessionHealth");

async function main() {
  const platform = "wellfound";
  recordLoginStart(platform);
  const context = await launchPersistentProfile(platform, { headless: false });
  try {
    const page = await context.newPage();
    await page.goto("https://wellfound.com/login", { waitUntil: "domcontentloaded" });
    console.log("Log in to Wellfound in the opened browser. Press Enter here when finished.");
    process.stdin.resume();
    process.stdin.once("data", async () => {
      recordLoginConfirmed(platform);
      await context.close();
      process.exit(0);
    });
  } catch (error) {
    recordLoginFailure(platform, error);
    await context.close();
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
