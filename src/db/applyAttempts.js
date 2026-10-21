const { applyAttemptsPrisma } = require("./prisma");
const { log } = require("../logging/logger");

function hostOf(value) {
  try { return new URL(value).host; }
  catch { return ""; }
}

async function createApplyAttempt(job, resume, gate) {
  const db = applyAttemptsPrisma();
  if (!db) return null;

  const url = job.url || job.URL || "";
  try {
    const created = await db.applyAttempt.create({
      data: {
      company: job.company || "Unknown company",
      designation: job.title || job.role || "Unknown role",
      jobUrl: url,
      source: job.source || gate?.source || "unknown",
      location: job.location || null,
      fitScore: Number.isFinite(Number(job.fit_score ?? job.fitScore)) ? Number(job.fit_score ?? job.fitScore) : null,
      compensationEstimate: job.compensation_probability || job.compensation_hint || null,
      resumePath: resume?.pdfPath || resume?.texPath || null,
      status: "running",
      stage: "queued",
      entryUrl: url,
      entryHost: hostOf(url),
      metadata: {
        autoSubmitAllowed: Boolean(gate?.canAutoSubmit),
        gateReasons: gate?.reasons || [],
        fitThreshold: gate?.threshold ?? null,
        initialFieldReport: [],
        fieldReportAfterFill: []
      },
      events: [{ at: new Date().toISOString(), stage: "queued", message: "Apply attempt created" }]
      }
    });
    return created.id;
  } catch (error) {
    log("apply.instrumentation.create.failed", { company: job.company, error: error.message });
    return null;
  }
}

async function recordApplyProgress(attemptId, event) {
  if (!attemptId) return;
  const db = applyAttemptsPrisma();
  if (!db) return;
  try {
    const current = await db.applyAttempt.findUnique({ where: { id: attemptId } });
    if (!current) return;
    const events = Array.isArray(current.events) ? current.events : [];
    const details = event.details && typeof event.details === "object" ? event.details : {};
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const metadataPatch = details.metadata && typeof details.metadata === "object" ? details.metadata : {};
    const data = { stage: event.stage || current.stage, events: [...events, event], metadata: { ...metadata, ...metadataPatch } };
    for (const field of ["entryUrl", "finalUrl", "entryHost", "finalHost", "pageTitle", "screenshotPath", "navigationHttpStatus", "pageReached", "redirected", "externalRedirect"]) {
      if (Object.prototype.hasOwnProperty.call(details, field)) data[field] = details[field];
    }
    if (Array.isArray(details.missingRequiredFields)) data.missingRequiredFields = details.missingRequiredFields;
    if (event.error || details.error) data.error = String(event.error || details.error).slice(0, 4000);
    await db.applyAttempt.update({ where: { id: attemptId }, data });
  } catch (error) {
    log("apply.instrumentation.update.failed", { attemptId, error: error.message });
  }
}

async function finishApplyAttempt(attemptId, result = {}) {
  if (!attemptId) return;
  const db = applyAttemptsPrisma();
  if (!db) return;
  try {
    const current = await db.applyAttempt.findUnique({ where: { id: attemptId } });
    if (!current) return;
    const now = new Date();
    const events = Array.isArray(current.events) ? current.events : [];
    const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
    const resultMetadata = result.metadata && typeof result.metadata === "object" ? result.metadata : {};
    const eventsFromResult = Array.isArray(result.events) ? result.events : [];
    const finalUrl = result.finalUrl || resultMetadata.finalUrl;
    const data = {
      status: result.stage === "submission_unconfirmed" ? "submission_unconfirmed" : (result.status || "failed"),
      stage: result.stage || result.status || "failed",
      finishedAt: now,
      error: result.error ? String(result.error).slice(0, 4000) : null,
      screenshotPath: result.screenshotPath || null,
      submittedAt: result.submittedAt ? new Date(result.submittedAt) : null,
      metadata: { ...metadata, ...resultMetadata },
      events: [...events, ...eventsFromResult, { at: now.toISOString(), stage: result.stage || result.status || "finished", message: result.message || result.error || "Apply attempt finished" }]
    };
    if (finalUrl) {
      data.finalUrl = finalUrl;
      data.finalHost = result.finalHost || hostOf(finalUrl);
    }
    for (const field of ["entryHost", "navigationHttpStatus", "pageReached", "redirected", "externalRedirect", "pageTitle"]) {
      const value = result[field] ?? resultMetadata[field];
      if (value !== undefined) data[field] = value;
    }
    if (Array.isArray(result.missingRequiredFields)) data.missingRequiredFields = result.missingRequiredFields;
    await db.applyAttempt.update({ where: { id: attemptId }, data });
  } catch (error) {
    log("apply.instrumentation.finish.failed", { attemptId, error: error.message });
  }
}

module.exports = { createApplyAttempt, recordApplyProgress, finishApplyAttempt };
