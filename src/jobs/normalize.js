const { log } = require("../logging/logger");

function stripHtml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/â€™/g, "'")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value) {
  return String(value || "").trim();
}

function normalizeJob(job) {
  return {
    company: job.company || "",
    title: normalizeTitle(job.title || job.role || ""),
    role: normalizeTitle(job.role || job.title || ""),
    jd: stripHtml(job.jd || job.description || ""),
    url: job.url || "",
    location: job.location || "",
    source: job.source || "",
    salary_estimate: job.salary_estimate || job.compensation_hint || "",
    recruiter: job.recruiter || ""
  };
}

function isRelevantJob(job) {
  const title = `${job.title}`.toLowerCase();
  const text = `${job.title} ${job.jd}`.toLowerCase();
  const titleInclude = /(backend|software engineer|sde|platform|java|spring|systems|distributed|api|server)/.test(title);
  const jdInclude = /(backend engineer|java backend|spring boot|distributed systems|platform engineer)/.test(text);
  const exclude = /(frontend|ios|android|designer|product manager|sales|support|risk|growth|marketing|operations|analyst)/.test(title);
  
  const isRelevant = (titleInclude || jdInclude) && !exclude;
  if (isRelevant) {
    log("job.discovered", { company: job.company, title: job.title });
  } else {
    log("job.rejected", { company: job.company, title: job.title, reason: exclude ? "matched exclude pattern" : "missing required keywords" });
  }
  
  return isRelevant;
}

module.exports = { stripHtml, normalizeJob, isRelevantJob };
