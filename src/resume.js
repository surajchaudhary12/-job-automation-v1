const fs = require("fs");
const path = require("path");
const { candidateProfile } = require("./config");
const { compileLatexToPdf } = require("./compiler");

const TEMPLATE_BY_ROLE = [
  { pattern: /distributed systems|distributed|scalability|scale/i, file: "distributed_systems.tex" },
  { pattern: /full[ -]?stack/i, file: "fullstack.tex" },
  { pattern: /ai backend|llm|artificial intelligence|machine learning|\bai\b/i, file: "ai_backend.tex" },
  { pattern: /c\+\+|systems engineer|low.level/i, file: "cpp_systems.tex" },
  { pattern: /backend|java|spring boot|platform|software engineer/i, file: "backend_java.tex" },
  { pattern: /product engineer|product engineering/i, file: "generic_product_engineer.tex" }
];

function safeName(value) {
  return value.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function cleanField(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .find((part) => !/^(viewed|promoted|apply|easy apply|actively reviewing applicants)$/i.test(part)) || "";
}

function selectTemplate(job) {
  const haystack = `${job.title || job.role || ""} ${job.jd || ""}`;
  return TEMPLATE_BY_ROLE.find(({ pattern }) => pattern.test(haystack))?.file || "generic_product_engineer.tex";
}

function latexEscape(value) {
  const escapes = { "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "#": "\\#", "$": "\\$", "%": "\\%", "&": "\\&", "_": "\\_" };
  return String(value || "").replace(/[\\{}#$%&_]/g, (character) => escapes[character]);
}

function defaultSummary(job, profile, keywords = []) {
  const baseSummary = profile.resume_summary || profile.positioning || `${profile.title} at ${profile.current_company}`;
  const alreadyCovered = baseSummary.toLowerCase();
  const relevantSkills = keywords
    .filter((skill) => !alreadyCovered.includes(skill.toLowerCase()))
    .slice(0, 4);
  const alignment = relevantSkills.length ? ` Relevant skills for this role: ${relevantSkills.join(", ")}.` : "";
  return `${baseSummary}${alignment}`;
}

function renderItems(items) {
  return (items || []).map((item) => `\\item ${latexEscape(item)}`).join("\n");
}

function renderExperience(profile) {
  return (profile.experience || []).map((entry) => {
    const heading = `\\textbf{${latexEscape(entry.company)} — ${latexEscape(entry.title)}}${entry.location ? ` \\hfill ${latexEscape(entry.location)}` : ""}\\\\`;
    const meta = entry.dates ? `\\textit{${latexEscape(entry.dates)}}\\\\` : "";
    const description = entry.description ? `\\textit{${latexEscape(entry.description)}}\\\\` : "";
    return [heading, meta, description, "\\begin{itemize}", renderItems(entry.highlights), "\\end{itemize}"].filter(Boolean).join("\n");
  }).join("\n");
}

function orderedItems(items, requestedOrder, getLabel) {
  const requested = (Array.isArray(requestedOrder) ? requestedOrder : [])
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!requested.length) return items;
  const rank = (item) => {
    const label = getLabel(item).toLowerCase();
    const index = requested.findIndex((candidate) => candidate === label);
    return index < 0 ? requested.length : index;
  };
  return items.map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item);
}

function renderProjects(profile, options = {}) {
  const requestedOrder = options.resumeDeltas?.project_order || options.atsDeltas?.project_priority;
  const projects = orderedItems(profile.projects || [], requestedOrder, (project) => project.name);
  return projects.map((project) => {
    const links = (project.links || []).filter((link) => /^https?:\/\//i.test(link.url || ""))
      .map((link) => `\\href{${link.url}}{${latexEscape(link.label || link.url)}}`).join(" \\quad | \\quad ");
    return [
      `\\textbf{${latexEscape(project.name)}}\\\\`,
      project.technologies ? `\\textit{${latexEscape(project.technologies)}}\\\\` : "",
      project.subtitle ? `\\textit{${latexEscape(project.subtitle)}}\\\\` : "",
      project.description ? `${latexEscape(project.description)}\\\\` : "",
      "\\begin{itemize}",
      renderItems(project.highlights),
      "\\end{itemize}",
      links ? `${links}\\\\` : ""
    ].filter(Boolean).join("\n");
  }).join("\n");
}

function renderContactLinks(profile) {
  return [
    profile.linkedin ? `\\href{${profile.linkedin}}{LinkedIn}` : "",
    profile.github ? `\\href{${profile.github}}{GitHub}` : ""
  ].filter(Boolean).join(" \\quad | \\quad ");
}

function renderEducation(education) {
  const location = education.location ? latexEscape(education.location) : "";
  const dates = education.dates ? latexEscape(education.dates) : "";
  const detail = `${latexEscape(education.degree)} in ${latexEscape(education.major)}`;
  return `\\textbf{${latexEscape(education.institution)}}${location ? ` \\hfill ${location}` : ""}\\\\\n\\textit{${detail}}${dates ? ` \\hfill ${dates}` : ""}`;
}

function renderSkills(profile, options = {}) {
  const groups = Object.entries(profile.skill_groups || {});
  const deltas = options.resumeDeltas || {};
  const skillsOrder = deltas.ordered_skills || options.atsDeltas?.skills_order;
  const allowedLabels = new Set([...groups.map(([group]) => group.toLowerCase()), ...(profile.skills || []).map((skill) => skill.toLowerCase())]);
  const requestedOrder = Array.isArray(skillsOrder)
    ? skillsOrder.filter((skill) => typeof skill === "string" && allowedLabels.has(skill.trim().toLowerCase())).map((skill) => skill.trim().toLowerCase())
    : [];
  const orderedGroups = groups.map(([group, skills], index) => {
    const groupRank = requestedOrder.indexOf(group.toLowerCase());
    const skillRanks = skills.map((skill) => requestedOrder.indexOf(skill.toLowerCase())).filter((rank) => rank >= 0);
    return { group, skills, index, rank: groupRank >= 0 ? groupRank : (skillRanks.length ? Math.min(...skillRanks) : requestedOrder.length) };
  }).sort((a, b) => a.rank - b.rank || a.index - b.index);
  return orderedGroups
    .map(({ group, skills }) => {
      const orderedSkills = orderedItems(skills || [], requestedOrder, (skill) => skill);
      return `\\textbf{${latexEscape(group)}:} ${latexEscape(orderedSkills.join(", "))}\\\\`;
    })
    .join("\n");
}

function profileTokens(job, summary, options = {}) {
  const profile = candidateProfile();
  const education = profile.education || {};
  const achievements = [...(profile.achievements || []), ...(profile.additional_achievements || [])];

  return {
    "{{NAME}}": profile.name,
    "{{EMAIL}}": profile.email,
    "{{PHONE}}": profile.phone,
    "{{LOCATIONS}}": profile.location || (profile.preferred_locations || []).join(" / "),
    "{{CONTACT_LINKS}}": renderContactLinks(profile),
    "{{SUMMARY}}": summary,
    "{{CURRENT_COMPANY}}": profile.current_company,
    "{{CURRENT_TITLE}}": profile.title,
    "{{SKILLS}}": renderSkills(profile, options),
    "{{EXPERIENCE}}": renderExperience(profile),
    "{{PROJECTS}}": renderProjects(profile, options),
    "{{ACHIEVEMENTS}}": achievements.map(latexEscape).join(" \\quad | \\quad "),
    "{{EDUCATION}}": renderEducation(education)
  };
}

function renderProfile(tex, job, summary, options = {}) {
  const tokens = profileTokens(job, summary, options);
  const trustedLatexTokens = new Set(["{{CONTACT_LINKS}}", "{{SKILLS}}", "{{EXPERIENCE}}", "{{PROJECTS}}", "{{ACHIEVEMENTS}}", "{{EDUCATION}}"]);
  let output = tex;
  for (const [token, value] of Object.entries(tokens)) {
    output = output.replaceAll(token, trustedLatexTokens.has(token) ? value : latexEscape(value));
  }
  return output;
}

function jobKeywords(job, atsDeltas = {}) {
  const jd = `${job.title || job.role || ""} ${job.jd || ""}`.toLowerCase();
  const candidateSkills = candidateProfile().skills || [];
  const requestedKeywords = Array.isArray(atsDeltas.keywords) ? atsDeltas.keywords : [];
  const containsTerm = (text, term) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(text);
  };
  const matchedSkills = candidateSkills
    .filter((skill) => containsTerm(jd, skill))
    .sort((a, b) => jd.indexOf(a.toLowerCase()) - jd.indexOf(b.toLowerCase()));
  const requested = requestedKeywords
    .filter((keyword) => typeof keyword === "string")
    .map((keyword) => candidateSkills.find((skill) => skill.toLowerCase() === keyword.trim().toLowerCase()))
    .filter((skill) => skill && containsTerm(jd, skill));
  return [...new Set([...requested, ...matchedSkills])];
}

function generateTexContent(job, rootDir, options = {}) {
  const template = selectTemplate(job);
  const templatePath = path.join(rootDir, "templates", template);

  const profile = candidateProfile();
  const keywords = jobKeywords(job, options.atsDeltas || {});
  const summary = options.resumeDeltas?.summary || defaultSummary(job, profile, keywords);
  let tex = fs.readFileSync(templatePath, "utf8");
  return renderProfile(tex, { ...job, title: cleanField(job.title || job.role), role: cleanField(job.role || job.title), company: cleanField(job.company) }, summary, options);
}

async function generateResume(job, rootDir, options = {}) {
  const template = selectTemplate(job);
  const company = safeName(job.company);
  const version = new Date().toISOString().replace(/[:.]/g, "-");
  const generatedDir = path.join(rootDir, "generated");
  fs.mkdirSync(generatedDir, { recursive: true });
  const texPath = path.join(rootDir, "generated", `Suraj_resume_${company}.tex`);
  const pdfPath = path.join(rootDir, "generated", `Suraj_resume_${company}.pdf`);

  const tex = generateTexContent(job, rootDir, options);
  fs.writeFileSync(texPath, tex);
  const pdfBuffer = await compileLatexToPdf(tex, rootDir);
  fs.writeFileSync(pdfPath, pdfBuffer);
  const keywords = jobKeywords(job, options.atsDeltas || {});
  return { template, texPath, pdfPath, keywords, version, candidate: candidateProfile() };
}

module.exports = { generateResume, generateTexContent };
