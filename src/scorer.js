const BACKEND_TERMS = [
  "backend",
  "java",
  "spring boot",
  "rest",
  "api",
  "mysql",
  "mongodb",
  "distributed",
  "scalable",
  "systems",
  "platform",
  "performance",
  "monitoring",
  "debugging",
  "observability",
  "dsa",
  "algorithms"
];

const REJECT_TERMS = [
  "frontend-heavy",
  "pure frontend",
  "react role",
  "6+ years mandatory",
  "mandatory 6+",
  "senior sre",
  "sre role",
  "terraform",
  "kubernetes",
  "on-call"
];

function countMatches(text, terms) {
  const lower = text.toLowerCase();
  return terms.filter((term) => lower.includes(term)).length;
}

function estimateComp(job) {
  const hint = job.compensation_hint || "";
  const numbers = hint.match(/\d+/g)?.map(Number) || [];
  const max = numbers.length ? Math.max(...numbers) : 0;
  if (max >= 35) return "High: likely above current 20 LPA";
  if (max >= 20) return "Medium: likely around or above current 20 LPA";
  return "Low: possible downgrade risk";
}

function scoreJob(job) {
  const text = `${job.role} ${job.jd} ${job.location}`;
  const backendMatches = countMatches(text, BACKEND_TERMS);
  const rejectMatches = countMatches(text, REJECT_TERMS);
  const isPreferredLocation = /(bangalore|gurgaon|remote)/i.test(job.location || "");
  const hasCompUpside = /([3-9]\d|2[1-9])/.test(job.compensation_hint || "");

  let score = 4 + Math.min(backendMatches, 10) * 0.45;
  if (isPreferredLocation) score += 0.7;
  if (hasCompUpside) score += 0.8;
  score -= rejectMatches * 1.4;
  score = Math.max(1, Math.min(10, Number(score.toFixed(1))));

  const autoReject =
    score < 7 ||
    /frontend-heavy|pure frontend|react role/i.test(text) ||
    /6\+ years mandatory|mandatory 6\+|senior sre|sre role/i.test(text) ||
    estimateComp(job).startsWith("Low");

  return {
    fit_score: score,
    compensation_probability: estimateComp(job),
    career_upside: score >= 8 ? "High" : score >= 7 ? "Medium" : "Low",
    interview_probability: score >= 8 ? "Medium-High" : score >= 7 ? "Medium" : "Low",
    priority: score >= 8 ? "High" : score >= 7 ? "Medium" : "Low",
    status: autoReject ? "discovered" : "shortlisted",
    risks: autoReject ? ["Below apply threshold or violates targeting rules"] : []
  };
}

module.exports = { scoreJob };
