const { envFlag, envNumber } = require("../config");

const SUPPORTED_AUTO_APPLY_SOURCES = new Set(["greenhouse", "lever", "linkedin", "instahyre", "wellfound"]);

function normalizeSource(job) {
  return String(job?.source || "")
    .toLowerCase()
    .trim();
}

function evaluateAutoSubmit(job, options = {}) {
  const confidence = Number(job?.fit_score || job?.fitScore || 0);
  const source = normalizeSource(job);
  const autoSubmitEnabled = options.autoSubmit ?? envFlag("AUTO_SUBMIT", false);
  const threshold = options.threshold ?? envNumber("AUTO_APPLY_THRESHOLD", 7);
  const lowRisk = SUPPORTED_AUTO_APPLY_SOURCES.has(source) || /greenhouse|lever|linkedin|instahyre|wellfound/i.test(String(job?.url || ""));

  const reasons = [];
  if (!autoSubmitEnabled) reasons.push("AUTO_SUBMIT disabled");
  if (confidence < threshold) reasons.push(`fit below threshold (${confidence} < ${threshold})`);
  if (!lowRisk) reasons.push("unsupported or higher-risk ATS");

  return {
    source,
    confidence,
    threshold,
    lowRisk,
    reasons,
    canAutoSubmit: reasons.length === 0
  };
}

module.exports = { evaluateAutoSubmit };
