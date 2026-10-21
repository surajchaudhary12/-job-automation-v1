const { envFlag, envNumber } = require("../config");

const SUPPORTED_AUTO_APPLY_SOURCES = new Set(["greenhouse", "lever", "linkedin", "instahyre", "wellfound", "keka", "ashby"]);

function normalizeSource(job) {
  try {
    const host = new URL(String(job?.url || job?.URL || "")).hostname.toLowerCase();
    if (host === "keka.com" || host.endsWith(".keka.com")) return "keka";
    if (host === "ashbyhq.com" || host.endsWith(".ashbyhq.com")) return "ashby";
  } catch { }
  return String(job?.source || "")
    .toLowerCase()
    .trim();
}

function isSupportedAtsUrl(value) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return ["greenhouse.io", "lever.co", "linkedin.com", "instahyre.com", "wellfound.com", "keka.com", "ashbyhq.com"]
      .some((domain) => host === domain || host.endsWith("." + domain));
  } catch {
    return false;
  }
}

function evaluateAutoSubmit(job, options = {}) {
  const confidence = Number(job?.fit_score || job?.fitScore || 0);
  const source = normalizeSource(job);
  const autoSubmitEnabled = options.autoSubmit ?? envFlag("AUTO_SUBMIT", false);
  const threshold = options.threshold ?? envNumber("AUTO_APPLY_THRESHOLD", 8.5);
  const jobUrl = String(job?.url || job?.URL || "");
  const lowRisk = jobUrl ? isSupportedAtsUrl(jobUrl) : SUPPORTED_AUTO_APPLY_SOURCES.has(source);
  const jobText = `${job?.title || job?.role || ""} ${job?.jd || ""}`.toLowerCase();
  const compensation = String(job?.compensation_probability || job?.compensation_hint || "").toLowerCase();
  const compensationQualified = /high|medium|above current 20 lpa|around or above current 20 lpa|\b(20|2[1-9]|[3-9]\d)\s*(lpa|lakhs?|lacs?)\b/.test(compensation);
  const title = String(job?.title || job?.role || "").toLowerCase();
  const targetingRisk = /\b(frontend|front-end|ios|android|designer|product manager|sales|support|risk|growth|marketing|operations)\b/.test(title) ||
    /(pure frontend|pure front-end|mandatory\s*6\+\s*years|6\+\s*years mandatory|senior sre|sre role|sre[- ]only|devops[- ]only)/i.test(jobText);

  const reasons = [];
  if (!autoSubmitEnabled) reasons.push("AUTO_SUBMIT disabled");
  if (confidence < threshold) reasons.push(`fit below threshold (${confidence} < ${threshold})`);
  if (!lowRisk) reasons.push("unsupported or higher-risk ATS");
  if (!compensationQualified) reasons.push("compensation is unknown or below the 20 LPA target");
  if (targetingRisk) reasons.push("role matches an auto-reject targeting rule");

  return {
    source,
    confidence,
    threshold,
    lowRisk: lowRisk && compensationQualified && !targetingRisk,
    reasons,
    canAutoSubmit: reasons.length === 0
  };
}

module.exports = { evaluateAutoSubmit };
