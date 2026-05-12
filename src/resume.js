const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { candidateProfile } = require("./config");

const TEMPLATE_BY_ROLE = [
  { pattern: /distributed systems|distributed|scalability|scale/i, file: "distributed_systems.tex" },
  { pattern: /full stack/i, file: "fullstack.tex" },
  { pattern: /ai backend|llm|ai/i, file: "ai_backend.tex" },
  { pattern: /c\+\+/i, file: "cpp_systems.tex" },
  { pattern: /backend|java|spring boot|platform|software engineer/i, file: "backend_java.tex" },
  { pattern: /product engineer|product engineering/i, file: "generic_product_engineer.tex" }
];

function safeName(value) {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function selectTemplate(job) {
  const haystack = `${job.role} ${job.jd}`;
  return TEMPLATE_BY_ROLE.find((entry) => entry.pattern.test(haystack))?.file || "backend_java.tex";
}

function latexEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/%/g, "\\%")
    .replace(/&/g, "\\&")
    .replace(/_/g, "\\_");
}

function defaultSummary(job, profile, keywords = []) {
  const title = job.title || job.role;
  const company = job.company;
  const alignment = keywords.length ? ` Strong alignment to ${keywords.slice(0, 5).join(", ")}.` : "";
  return `${profile.positioning.replace(/\.$/, "")}, currently an ${profile.title} at ${profile.current_company}. Targeting ${title} at ${company}, with experience in backend systems, production workflows, scalable applications, monitoring/debugging, and API optimization.${alignment}`;
}

function profileTokens(job, summary) {
  const profile = candidateProfile();
  const education = profile.education || {};
  return {
    "{{NAME}}": profile.name,
    "{{EMAIL}}": profile.email,
    "{{PHONE}}": profile.phone,
    "{{LOCATIONS}}": (profile.preferred_locations || []).join(" / "),
    "{{SUMMARY}}": summary,
    "{{CURRENT_COMPANY}}": profile.current_company,
    "{{CURRENT_TITLE}}": profile.title,
    "{{NMV}}": profile.metrics?.nmv,
    "{{RETENTION}}": profile.metrics?.retention,
    "{{REVENUE}}": profile.metrics?.revenue,
    "{{ACHIEVEMENTS}}": (profile.achievements || []).join(" \\quad | \\quad "),
    "{{EDUCATION}}": `${education.institution} \\hfill ${education.degree}, ${education.major}`
  };
}

function renderProfile(tex, job, summary) {
  const tokens = profileTokens(job, summary);
  let output = tex;
  for (const [token, value] of Object.entries(tokens)) {
    output = output.replaceAll(
      token,
      latexEscape(value)
        .replace(/\\textbackslash\{\}hfill/g, "\\hfill")
        .replace(/\\textbackslash\{\}quad/g, "\\quad")
    );
  }
  return output;
}

function jobKeywords(job, atsDeltas = {}) {
  const jd = job.jd.toLowerCase();
  const keywords = [];
  for (const term of ["Distributed Systems", "Scalability", "Java", "Spring Boot", "REST APIs", "MySQL", "MongoDB", "Monitoring", "Debugging", "Performance Optimization"]) {
    if (jd.includes(term.toLowerCase())) keywords.push(term);
  }
  return [...new Set([...(atsDeltas.keywords || []), ...keywords])];
}

function maybeCompilePdf(texPath) {
  try {
    execFileSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", path.basename(texPath)], {
      cwd: path.dirname(texPath),
      stdio: "ignore"
    });
    return texPath.replace(/\.tex$/i, ".pdf");
  } catch {
    return null;
  }
}

function generateResume(job, rootDir, options = {}) {
  const template = selectTemplate(job);
  const templatePath = path.join(rootDir, "templates", template);
  const company = safeName(job.company);
  const version = new Date().toISOString().replace(/[:.]/g, "-");
  const texPath = path.join(rootDir, "generated", `Suraj_resume_${company}.tex`);

  const profile = candidateProfile();
  const keywords = jobKeywords(job, options.atsDeltas || {});
  const summary = options.resumeDeltas?.summary || defaultSummary(job, profile, keywords);
  let tex = fs.readFileSync(templatePath, "utf8");
  tex = renderProfile(tex, job, summary);
  fs.writeFileSync(texPath, tex);

  const pdfPath = maybeCompilePdf(texPath);
  return { template, texPath, pdfPath, keywords, version };
}

module.exports = { generateResume };
