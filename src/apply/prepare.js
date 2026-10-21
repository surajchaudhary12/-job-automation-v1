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
const { runJavaApply } = require("./javaWorker");
const { createApplyAttempt, recordApplyProgress, finishApplyAttempt } = require("../db/applyAttempts");

async function prepareApply(job, resume, options = {}) {
  const jobUrl = job.url || job.URL || "";
  const jobHost = (() => { try { return new URL(jobUrl).hostname.toLowerCase(); } catch { return ""; } })();
  const source = jobHost === "keka.com" || jobHost.endsWith(".keka.com") ? "keka"
    : jobHost === "ashbyhq.com" || jobHost.endsWith(".ashbyhq.com") ? "ashby"
      : String(job.source || "").toLowerCase();
  const normalizedJob = { ...job, source };
  const gate = evaluateAutoSubmit(normalizedJob, { autoSubmit: options.autoSubmit ?? envFlag("AUTO_SUBMIT", false), threshold: options.threshold });
  const confidence = gate.confidence;
  const artifactName = `${String(job.company || "job").replace(/[^a-z0-9]+/gi, "_")}_${Date.now()}`;
  const attemptId = await createApplyAttempt(normalizedJob, resume, gate);
  let navigationInfo = {};

  async function finalizeAttempt(result) {
    const completed = { ...result, gate };
    await finishApplyAttempt(attemptId, { ...completed, ...navigationInfo });
    return completed;
  }

  if (["greenhouse", "lever", "keka", "ashby"].includes(source) && envFlag("JAVA_APPLY_ENABLED", true)) {
    await recordApplyProgress(attemptId, { at: new Date().toISOString(), stage: "java_worker_starting", message: "Starting Java application worker" });
    const result = await runJavaApply(normalizedJob, resume, {
      autoSubmit: gate.canAutoSubmit,
      headless: options.headless,
      attemptId
    });
    const status = result.status === "submitted" ? "applied" : result.status;
    return finalizeAttempt({ ...result, status });
  }

  let context;
  try {
    await recordApplyProgress(attemptId, { at: new Date().toISOString(), stage: "browser_launching", message: "Starting browser profile" });
    context = await launchPersistentProfile(
      (source === "linkedin" || source === "wellfound" || source === "instahyre") ? source : "default",
      { headless: options.headless }
    );
    const page = await context.newPage();
    const entryUrl = job.url || job.URL || "";
    await recordApplyProgress(attemptId, { at: new Date().toISOString(), stage: "navigation_started", message: "Opening job destination", details: { entryUrl } });
    const response = await page.goto(entryUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const finalUrl = page.url();
    const entryHost = (() => { try { return new URL(entryUrl).host; } catch { return ""; } })();
    const finalHost = (() => { try { return new URL(finalUrl).host; } catch { return ""; } })();
    navigationInfo = {
      entryHost,
      finalUrl,
      finalHost,
      navigationHttpStatus: response?.status() ?? null,
      pageReached: Boolean(finalUrl),
      redirected: Boolean(finalUrl && finalUrl !== entryUrl),
      externalRedirect: Boolean(entryHost && finalHost && entryHost.toLowerCase() !== finalHost.toLowerCase()),
      pageTitle: await page.title().catch(() => "")
    };
    await recordApplyProgress(attemptId, { at: new Date().toISOString(), stage: "navigation_reached", message: "Job page loaded in browser", details: { entryUrl, ...navigationInfo } });
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
      return finalizeAttempt({ ...result, screenshotPath, ...navigationInfo });
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
      return await finalizeAttempt({ status: "failed", submitted: false, error: error.message, stage: "browser_error", ...navigationInfo });
    }
  } finally {
    if (options.keepOpen && context) {
        // Do not close context if user wants to review
    } else if (context) {
        await context.close();
    }
  }
}

module.exports = { prepareApply };
