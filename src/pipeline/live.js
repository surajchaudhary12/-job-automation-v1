const { rootDir, envFlag, envNumber } = require("../config");
const { discoverJobs } = require("../jobs");
const { scoreJob } = require("../scorer");
const { generateResume } = require("../resume");
const { recruiterMessage } = require("../outreach");
const { upsertApplication } = require("../tracker");
const { storeApplication, storeRun } = require("../db/store");
const { disconnectPrisma } = require("../db/prisma");
const llm = require("../llm/ollama");
const { prepareApply } = require("../apply/prepare");
const { saveReport } = require("../report");
const { log } = require("../logging/logger");

function mergeLlmScore(score, enhancement) {
  if (!enhancement?.json) return score;
  const json = enhancement.json;
  return {
    ...score,
    fit_score: Number(json.fit_score || score.fit_score),
    compensation_probability: json.compensation_probability || score.compensation_probability,
    career_upside: json.career_upside || score.career_upside,
    interview_probability: json.interview_probability || score.interview_probability,
    risks: Array.isArray(json.risks) ? json.risks : score.risks
  };
}

function tokenUsageTotal(usages) {
  return usages.reduce((acc, usage) => {
    acc.prompt += usage?.prompt_tokens || 0;
    acc.completion += usage?.completion_tokens || 0;
    return acc;
  }, { prompt: 0, completion: 0 });
}

async function runLivePipeline(options = {}) {
  const root = rootDir();
  const limit = options.limit || 25;
  const maxApplications = envNumber("MAX_APPLICATIONS_PER_DAY", 35);
  const liveApply = options.prepareApply ?? envFlag("LIVE_APPLY", false);
  const useLlm = options.useLlm ?? llm.enabled();
  const autoApplyThreshold = envNumber("AUTO_APPLY_THRESHOLD", 8);
  const usages = [];

  log("run.start", { mode: "live", limit, useLlm, liveApply, autoApplyThreshold });
  const jobs = await discoverJobs({ limit });
  log("discovery.complete", { count: jobs.length });

  const results = [];
  let preparedCount = 0;

  for (const job of jobs) {
    if (preparedCount >= maxApplications) break;
    
    let status = "DISCOVERED";

    const heuristic = scoreJob({ ...job, role: job.title, compensation_hint: job.salary_estimate });
    let score = heuristic;

    if (useLlm && heuristic.fit_score >= 6.5) {
      try {
        log("pipeline.stage", { company: job.company, stage: "ANALYZED", message: "Starting Ollama analysis" });
        const enhanced = await llm.enhanceFitScore(job, heuristic);
        if (enhanced?.usage) usages.push(enhanced.usage);
        score = mergeLlmScore(heuristic, enhanced);
        status = "ANALYZED";
      } catch (error) {
        log("llm.score.failed", { company: job.company, title: job.title, error: error.message });
      }
    }

    const shouldTailor = score.fit_score >= 7 && !score.compensation_probability?.startsWith("Low");
    let resume = { template: "", texPath: "", pdfPath: null, keywords: [] };
    let message = "";

    if (shouldTailor) {
      let atsDeltas = {};
      let resumeDeltas = {};
      if (useLlm) {
        try {
          const ats = await llm.extractAtsDeltas(job);
          if (ats?.usage) usages.push(ats.usage);
          atsDeltas = ats?.json || {};

          const tailored = await llm.tailorResumeDeltas(job);
          if (tailored?.usage) usages.push(tailored.usage);
          resumeDeltas = tailored?.json || {};
        } catch (error) {
          log("llm.resume.failed", { company: job.company, title: job.title, error: error.message });
        }
      }

      log("pipeline.stage", { company: job.company, stage: "RESUME_GENERATED", message: "Generating tailored resume" });
      resume = generateResume({ ...job, role: job.title }, root, { atsDeltas, resumeDeltas });
      status = "RESUME_GENERATED";

      if (job.recruiter) {
        try {
          const outreach = useLlm ? await llm.recruiterOutreach(job) : null;
          if (outreach?.usage) usages.push(outreach.usage);
          message = outreach?.json?.message || recruiterMessage({ ...job, role: job.title });
        } catch {
          message = recruiterMessage({ ...job, role: job.title });
        }
      }
    }

    const shouldAutoApply = score.fit_score >= autoApplyThreshold;
    if (shouldTailor && !shouldAutoApply) {
        status = "REVIEW_REQUIRED";
    }

    const entry = {
      company: job.company,
      role: job.title,
      URL: job.url,
      jd: job.jd,
      location: job.location,
      source: job.source,
      fit_score: score.fit_score,
      compensation_estimate: score.compensation_probability,
      status,
      date_applied: "",
      recruiter: job.recruiter || "",
      recruiter_message: message,
      resume_template: resume.template,
      resume_version: resume.version || "",
      resume_used: resume.pdfPath || resume.texPath || "",
      notes: [
        `Career upside: ${score.career_upside}`,
        `Interview probability: ${score.interview_probability}`,
        `Priority: ${score.priority}`,
        score.risks?.length ? `Risks: ${score.risks.join("; ")}` : "Ready for human apply review"
      ].join(" | "),
      updated_at: new Date().toISOString()
    };

    if (liveApply && shouldTailor && shouldAutoApply) {
      log("pipeline.stage", { company: job.company, stage: "APPLYING", message: "Executing platform application" });
      entry.status = "APPLYING";
      const prepared = await prepareApply({ ...job, fit_score: score.fit_score }, resume, { autoSubmit: false });
      
      if (prepared.status === "prepared") {
         entry.status = "REVIEW_REQUIRED";
         preparedCount += 1;
      } else if (prepared.status === "applied") {
         entry.status = "APPLIED";
         preparedCount += 1;
      } else {
         entry.status = "FAILED";
         log("pipeline.failure", { company: job.company, error: "Apply preparation failed" });
      }
    }

    upsertApplication(root, entry);
    log("job.persisted", { company: entry.company, role: entry.role, status: entry.status });
    await storeApplication(entry).catch((error) => log("db.application.failed", { error: error.message }));
    results.push({ ...entry, priority: score.priority });
  }

  const report = await saveReport(root, results);
  const usage = tokenUsageTotal(usages);
  const runSummary = {
    mode: "live",
    discoveredCount: jobs.length,
    shortlistedCount: results.filter((item) => ["REVIEW_REQUIRED", "APPLIED", "APPLYING"].includes(item.status)).length,
    preparedCount,
    appliedCount: results.filter((item) => item.status === "APPLIED").length,
    llmPromptTokens: usage.prompt,
    llmCompletionTokens: usage.completion,
    estimatedCostUsd: 0,
    summary: JSON.stringify({ report })
  };
  await storeRun(runSummary).catch((error) => log("db.run.failed", { error: error.message }));
  await disconnectPrisma();
  log("run.complete", runSummary);

  return { ...runSummary, report };
}

module.exports = { runLivePipeline };
