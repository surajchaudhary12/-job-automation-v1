const path = require("path");
const { envFlag } = require("../config");
const { launchPersistentProfile } = require("../browser/session");
const { warmPage, humanDelay } = require("../browser/humanBehavior");
const { evaluateAutoSubmit } = require("./gates");
const { handleGreenhouse } = require("./ats/greenhouse");
const { handleLever } = require("./ats/lever");
const { handleLinkedInEasyApply } = require("./ats/linkedin");
const { handleInstahyre } = require("./ats/instahyre");
const { handleWellfound } = require("./ats/wellfound");

async function prepareApply(job, resume, options = {}) {
  const gate = evaluateAutoSubmit(job, { autoSubmit: options.autoSubmit ?? envFlag("AUTO_SUBMIT", false), threshold: options.threshold });
  const confidence = gate.confidence;
  const source = gate.source;
  const artifactName = `${String(job.company || "job").replace(/[^a-z0-9]+/gi, "_")}_${Date.now()}`;

  const context = await launchPersistentProfile(
    (source === "linkedin" || source === "wellfound" || source === "instahyre") ? source : "default",
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

    const canAutoSubmit = gate.canAutoSubmit;
    if (!canAutoSubmit) {
      console.log(`Auto-submit gated for ${job.company}: ${gate.reasons?.join(", ") || "gate not passed"}`);
    }
    
    // --- ATS ROUTER ---
    async function finalize(result) {
      let screenshotPath = result?.screenshotPath;
      if (!screenshotPath) {
        screenshotPath = path.join(process.cwd(), "logs", `${artifactName}.png`);
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true });
        } catch (error) {
          console.error(`Failed to capture screenshot for ${job.company}:`, error.message);
          screenshotPath = "";
        }
      }
      return { ...result, screenshotPath, gate };
    }

    function normalizeResultStatus(result) {
      const status = String(result?.status || "").toLowerCase();
      if (status === "submitted" || status === "applied") return "applied";
      if (status === "review_required") return "review_required";
      if (status === "failed") return "failed";
      return canAutoSubmit ? "applied" : "prepared";
    }

    try {
      if (source === 'greenhouse' || (job.url && job.url.includes('greenhouse.io'))) {
        const result = await handleGreenhouse(page, job, resume, { autoSubmit: canAutoSubmit });
        const status = normalizeResultStatus(result);
        return await finalize({ status, submitted: status === "applied", ...result });
      } else if (source === 'lever' || (job.url && job.url.includes('lever.co'))) {
        const result = await handleLever(page, job, resume, { autoSubmit: canAutoSubmit });
        const status = normalizeResultStatus(result);
        return await finalize({ status, submitted: status === "applied", ...result });
      } else if (source === 'linkedin') {
        const result = await handleLinkedInEasyApply(page, job, resume, { autoSubmit: canAutoSubmit });
        const status = normalizeResultStatus(result);
        return await finalize({ status, submitted: status === "applied", ...result });
      } else if (source === 'instahyre') {
        const result = await handleInstahyre(page, job, resume, { autoSubmit: canAutoSubmit });
        const status = normalizeResultStatus(result);
        return await finalize({ status, submitted: status === "applied", ...result });
      } else if (source === 'wellfound') {
        const result = await handleWellfound(page, job, resume, { autoSubmit: canAutoSubmit });
        const status = normalizeResultStatus(result);
        return await finalize({ status, submitted: status === "applied", ...result });
      }

      // Fallback: simple file upload if not a specific ATS handler
      const fileInputs = await page.locator('input[type="file"]').all();
      if (fileInputs.length && resume?.pdfPath) {
        await fileInputs[0].setInputFiles(path.resolve(resume.pdfPath));
        await humanDelay(800, 1800);
      }

      console.log(
        `No automated handler yet for ${job.source}. Leaving for manual review.`,
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
      
      return await finalize({ status: "prepared", submitted: false });
    } catch (error) {
      console.error(`Failed to apply for ${job.company}:`, error.message);
      return await finalize({ status: "failed", submitted: false, error: error.message });
    }
  } finally {
    if (options.keepOpen) {
        // Do not close context if user wants to review
    } else {
        await context.close();
    }
  }
}

module.exports = { prepareApply };
