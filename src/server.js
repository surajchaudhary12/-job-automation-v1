const express = require("express");
const fs = require("fs");
const path = require("path");
const { readTracker, entryId, findApplication, updateApplication, readLogs } = require("./tracker");
const { rootDir } = require("./config");
const { runLivePipeline } = require("./pipeline/live");
const { allSessionHealth } = require("./browser/sessionHealth");
const { ollamaHealth } = require("./llm/health");
const { log } = require("./logging/logger");
const { launchPersistentProfile } = require("./browser/session");

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.DASHBOARD_ORIGIN || "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json());

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

function enrichApplication(entry) {
  const resumePath = entry.resume_used || "";
  let resumeMtime = null;
  if (resumePath && fs.existsSync(resumePath)) {
    resumeMtime = fs.statSync(resumePath).mtime.toISOString();
  }
  return {
    id: entryId(entry),
    ...entry,
    resume_template: inferResumeTemplate(entry),
    resume_version: entry.resume_version || resumeMtime || "",
    resume_preview_url: resumePath ? `/api/resume?path=${encodeURIComponent(resumePath)}` : ""
  };
}

app.get("/api/applications", (req, res) => {
  res.json(readTracker(rootDir()).map(enrichApplication));
});

app.get("/api/jobs", (req, res) => {
  const entries = readTracker(rootDir());
  const activeStatuses = ["DISCOVERED", "ANALYZED", "RESUME_GENERATED", "REVIEW_REQUIRED", "APPLYING", "APPLIED", "FAILED"];
  res.json(entries.filter((entry) => activeStatuses.includes(entry.status)).map(enrichApplication));
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
  const generatedDir = path.join(rootDir(), "generated");
  if (!filePath.startsWith(generatedDir) || !fs.existsSync(filePath)) {
    return res.status(404).send("Resume not found");
  }
  if (filePath.endsWith(".pdf")) res.type("application/pdf");
  else res.type("text/plain");
  res.sendFile(filePath);
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
    linkedinAuthBrowser = await launchPersistentProfile("linkedin", { headless: false, channel: "chrome" });
    
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
    const result = await runLivePipeline({
      limit: Number(body.limit || 25),
      prepareApply: Boolean(body.prepareApply)
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Backend API listening on ${port}`));
