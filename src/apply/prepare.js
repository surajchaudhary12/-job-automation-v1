const path = require("path");
const { envFlag } = require("../config");
const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");
// const { handleGreenhouse } = require("./ats/greenhouse"); // To be created

async function prepareApply(job, resume, options = {}) {
  const autoSubmit = options.autoSubmit ?? envFlag("AUTO_SUBMIT", false);
  const confidence = Number(job.fit_score || job.fitScore || 0);
  const lowRisk = /greenhouse|lever|yc/i.test(job.source || "");

  const context = await launchPersistentProfile(
    job.source === "linkedin" ? "linkedin" : "default",
    {
      headless: options.headless,
    },
  );
  const page = await context.newPage();

  try {
    await page.goto(job.url || job.URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await warmPage(page);

    const fileInputs = await page.locator('input[type="file"]').all();
    if (fileInputs.length && resume?.pdfPath) {
      await fileInputs[0].setInputFiles(path.resolve(resume.pdfPath));
      await humanDelay(800, 1800);
    } else if (fileInputs.length && resume?.texPath) {
      console.log("Resume PDF unavailable; leaving upload for manual review.");
    }

    const canAutoSubmit = autoSubmit && confidence >= 8.5 && lowRisk;
    if (!canAutoSubmit) {
      console.log(
        "Application prepared. Review the browser and submit manually if everything looks correct.",
      );
      await page.screenshot({
        path: path.join(
          process.cwd(),
          "reports",
          `apply_prepare_${Date.now()}.png`,
        ),
        fullPage: true,
      });
      await humanDelay(3000, 5000);
      return { status: "prepared", submitted: false };
    }

    console.log(
      `Auto-submit enabled for ${job.company}. Routing to ATS handler for: ${job.source}`,
    );

    try {
      // --- ATS ROUTER ---
      // if (job.source.toLowerCase() === 'greenhouse') {
      //   await handleGreenhouse(page, job, resume);
      //   return { status: "applied", submitted: true };
      // } else if (job.source.toLowerCase() === 'linkedin') {
      //   // await handleLinkedInEasyApply(page, job, resume);
      // }

      console.log(
        `No automated handler yet for ${job.source}. Leaving for manual review.`,
      );
      return { status: "prepared", submitted: false };
    } catch (error) {
      console.error(`Failed to auto-apply for ${job.company}:`, error.message);
      return { status: "failed", submitted: false };
    }
  } finally {
    await context.close();
  }
}

module.exports = { prepareApply };
