const express = require("express");
const fs = require("fs");
const path = require("path");
const { readTracker, entryId, findApplication, updateApplication, readLogs } = require("./tracker");
const { rootDir } = require("./config");
const { runLivePipeline } = require("./pipeline/live");
const { generateTexContent } = require("./resume");
const { compileLatexToPdf } = require("./compiler");
const { allSessionHealth } = require("./browser/sessionHealth");
const { ollamaHealth } = require("./llm/health");
const { log } = require("./logging/logger");
const { launchPersistentProfile } = require("./browser/session");
const aggregationRoutes = require("./jobs/routes/aggregationRoutes");
const aggregationScheduler = require("./jobs/schedulers/aggregationScheduler");

// Start the aggregation scheduler
aggregationScheduler.start();

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.DASHBOARD_ORIGIN || "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "X-Resume-Pdf-Path, X-Resume-Tex-Path");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

app.use("/api/aggregation", aggregationRoutes);

app.get("/health", (req, res) => res.json({ ok: true }));

function inferResumeTemplate(entry) {
  if (entry.resume_template) return entry.resume_template;
  const role = String(entry.role || "").toLowerCase();
  if (role.includes("distributed") || role.includes("platform")) return "distributed_systems.tex";
  if (role.includes("c++")) return "cpp_systems.tex";
  if (role.includes("full")) return "fullstack.tex";
  if (role.includes("ai")) return "ai_backend.tex";
  if (role.includes("product")) return "generic_product_engineer.tex";
  return entry.resume_used ? "backend_java.tex" : "";
}

function normalizePipelineJob(entry) {
  return {
    company: entry.company,
    title: entry.role || entry.title || "",
    url: entry.URL || entry.url || "",
    jd: entry.jd || "",
    location: entry.location || "",
    source: entry.source || "",
    salary_estimate: entry.compensation_estimate || "",
    recruiter: entry.recruiter || "",
    recruiter_message: entry.recruiter_message || ""
  };
}

function downloadName(filePath) {
  return path.basename(filePath || "Resume.pdf");
}

function isWithinDirectory(filePath, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(filePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function safeArtifactPath(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  const allowedRoots = [
    path.join(rootDir(), "logs"),
    path.join(rootDir(), "reports"),
    path.join(rootDir(), "generated")
  ];
  return allowedRoots.some((base) => isWithinDirectory(resolved, base)) && fs.existsSync(resolved) ? resolved : null;
}

function latestLogArtifact(pattern) {
  const logDir = path.join(rootDir(), "logs");
  if (!fs.existsSync(logDir)) return "";
  const matches = fs.readdirSync(logDir)
    .filter((name) => pattern.test(name))
    .map((name) => path.join(logDir, name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return matches[0] || "";
}

function inferApplicationScreenshot(entry) {
  const explicit = safeArtifactPath(entry.application_screenshot);
  if (explicit) return explicit;
  const source = String(entry.source || "").toLowerCase();
  const status = String(entry.status || "").toUpperCase();
  if (source === "greenhouse" && status === "APPLIED") return latestLogArtifact(/^greenhouse_confirm_.*\.png$/i);
  if (source === "greenhouse" && status === "REVIEW_REQUIRED") return latestLogArtifact(/^greenhouse_review_.*\.png$/i);
  return "";
}

function enrichApplication(entry) {
  const resumePath = entry.resume_used || "";
  const screenshotPath = inferApplicationScreenshot(entry);
  let resumeMtime = null;
  if (resumePath && fs.existsSync(resumePath)) {
    resumeMtime = fs.statSync(resumePath).mtime.toISOString();
  }
  return {
    id: entryId(entry),
    ...entry,
    resume_template: inferResumeTemplate(entry),
    resume_version: entry.resume_version || resumeMtime || "",
    resume_preview_url: resumePath ? `/api/resume?path=${encodeURIComponent(resumePath)}` : "",
    application_screenshot_url: screenshotPath ? `/api/artifact?path=${encodeURIComponent(screenshotPath)}` : ""
  };
}

app.get("/api/applications", (req, res) => {
  const applications = readTracker(rootDir()).map(enrichApplication);
  log("api.jobs.returned", { endpoint: "/api/applications", count: applications.length });
  res.json(applications);
});

app.get("/api/jobs", (req, res) => {
  const entries = readTracker(rootDir());
  const activeStatuses = ["DISCOVERED", "ANALYZED", "RESUME_GENERATED", "REVIEW_REQUIRED", "APPLYING", "APPLIED", "FAILED"];
  const jobs = entries
    .filter((entry) => activeStatuses.includes(String(entry.status || "").toUpperCase()))
    .map(enrichApplication);
  log("api.jobs.returned", { endpoint: "/api/jobs", count: jobs.length });
  res.json(jobs);
});

app.get("/api/applications/:id", (req, res) => {
  const entry = findApplication(rootDir(), req.params.id);
  if (!entry) return res.status(404).json({ error: "Application not found" });
  res.json(enrichApplication(entry));
});

app.patch("/api/applications/:id", (req, res) => {
  const allowed = ["status", "recruiter_message", "resume_summary", "notes", "review_decision"];
  const patch = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
  }
  const updated = updateApplication(rootDir(), req.params.id, patch);
  if (!updated) return res.status(404).json({ error: "Application not found" });
  res.json(enrichApplication(updated));
});

app.get("/api/resume", (req, res) => {
  const filePath = path.resolve(String(req.query.path || ""));
  const safePath = safeArtifactPath(filePath);
  const generatedDir = path.join(rootDir(), "generated");
  const extension = safePath ? path.extname(safePath).toLowerCase() : "";
  if (!safePath || !isWithinDirectory(safePath, generatedDir) || ![".pdf", ".tex"].includes(extension)) {
    return res.status(404).send("Resume not found");
  }
  const shouldDownload = String(req.query.download || "").toLowerCase() === "1" || String(req.query.download || "").toLowerCase() === "true";
  if (extension === ".pdf") res.type("application/pdf");
  else res.type("text/plain");
  if (shouldDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName(safePath)}"`);
  }
  res.sendFile(safePath);
});

app.get("/api/artifact", (req, res) => {
  const safePath = safeArtifactPath(path.resolve(String(req.query.path || "")));
  if (!safePath) return res.status(404).send("Artifact not found");
  const ext = path.extname(safePath).toLowerCase();
  if (ext === ".png") res.type("image/png");
  else if (ext === ".jpg" || ext === ".jpeg") res.type("image/jpeg");
  else if (ext === ".pdf") res.type("application/pdf");
  else if (ext === ".html" || ext === ".htm") res.type("text/html");
  else res.type("text/plain");
  const shouldDownload = String(req.query.download || "").toLowerCase() === "1" || String(req.query.download || "").toLowerCase() === "true";
  if (shouldDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName(safePath)}"`);
  }
  res.sendFile(safePath);
});

app.get("/api/sessions", (req, res) => {
  res.json(allSessionHealth());
});

app.post("/api/sessions/:platform/relogin", (req, res) => {
  const session = allSessionHealth().find((item) => item.platform === req.params.platform);
  if (!session) return res.status(404).json({ error: "Unknown platform" });
  log("browser.relogin.requested", { platform: req.params.platform });
  res.json({
    platform: req.params.platform,
    command: session.relogin_command,
    message: `Run ${session.relogin_command} in a terminal to refresh the persistent browser profile.`
  });
});

let linkedinAuthBrowser = null;

app.post("/api/browser/login/linkedin", async (req, res) => {
  if (linkedinAuthBrowser) {
    try {
      const pages = linkedinAuthBrowser.pages();
      if (pages.length === 0) {
        await linkedinAuthBrowser.close();
        linkedinAuthBrowser = null;
      } else {
        return res.status(400).json({ error: "LinkedIn session already open. Close it first." });
      }
    } catch (e) {
      linkedinAuthBrowser = null;
    }
  }

  log("browser.login.linkedin.requested");
  try {
    linkedinAuthBrowser = await launchPersistentProfile("linkedin", { headless: true, channel: "chrome" });
    
    linkedinAuthBrowser.on('close', () => {
      linkedinAuthBrowser = null;
      log("browser.login.linkedin.closed");
    });

    res.json({ status: "launched", message: "LinkedIn browser session started for manual login." });
  } catch (error) {
    log("browser.login.linkedin.error", { error: error.message });
    linkedinAuthBrowser = null;
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/ollama/health", async (req, res) => {
  res.json(await ollamaHealth());
});

app.get("/api/health/status", async (req, res) => {
  const logs = readLogs(rootDir(), 250);
  const lastRun = [...logs].reverse().find((item) => item.event === "run.complete");
  const failures = logs.filter((item) => item.event?.includes("failed")).slice(-20);
  const ollamaEvents = logs.filter((item) => item.event === "llm.ollama.complete");
  const latestOllama = ollamaEvents.at(-1);
  const sessions = allSessionHealth();
  const ollama = await ollamaHealth();
  res.json({
    last_run: lastRun || null,
    jobs_discovered: lastRun?.discoveredCount || 0,
    failures,
    ollama_latency_ms: latestOllama?.wall_ms || null,
    ollama,
    playwright_session_health: Object.fromEntries(sessions.map((session) => [session.platform, session.status])),
    sessions,
    linkedin_session_status: sessions.find((session) => session.platform === "linkedin")?.status || "unknown",
    captcha_warnings: failures.filter((item) => /captcha/i.test(JSON.stringify(item)))
  });
});

app.post("/api/runs/live", async (req, res) => {
  try {
    const body = req.body || {};
    let jobs = undefined;
    if (body.jobId) {
      const selected = findApplication(rootDir(), body.jobId);
      if (!selected) {
        return res.status(404).json({ error: "Selected job not found" });
      }
      jobs = [normalizePipelineJob(selected)];
    } else if (body.job) {
      jobs = [body.job];
    }
    const result = await runLivePipeline({
      jobs,
      limit: Number(body.limit || 25),
      prepareApply: Boolean(body.prepareApply),
      autoSubmit: Boolean(body.autoSubmit)
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/resume/compile", async (req, res) => {
  try {
    const { job, resumeDeltas = {}, atsDeltas = {} } = req.body;
    if (!job || !job.role || !job.company) {
      return res.status(400).json({ error: "Missing required job details for resume generation." });
    }

    log("resume.compile.requested", { company: job.company });
    const company = String(job.company).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
    const generatedDir = path.join(rootDir(), "generated");
    fs.mkdirSync(generatedDir, { recursive: true });
    const texPath = path.join(generatedDir, `Suraj_resume_${company}.tex`);
    const pdfPath = path.join(generatedDir, `Suraj_resume_${company}.pdf`);
    const summary = job.resume_summary || resumeDeltas.summary;
    const texContent = generateTexContent(job, rootDir(), { resumeDeltas: { ...resumeDeltas, summary }, atsDeltas });
    fs.writeFileSync(texPath, texContent);
    const pdfBuffer = await compileLatexToPdf(texContent, rootDir());
    fs.writeFileSync(pdfPath, pdfBuffer);
    const version = new Date().toISOString();
    if (job.id) {
      updateApplication(rootDir(), job.id, { resume_used: pdfPath, resume_version: version });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(pdfPath)}"`);
    res.setHeader('X-Resume-Pdf-Path', pdfPath);
    res.setHeader('X-Resume-Tex-Path', texPath);
    res.send(pdfBuffer);
    
    log("resume.compile.success", { company: job.company });
  } catch (error) {
    log("resume.compile.error", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Backend API listening on ${port}`));
