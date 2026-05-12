const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { candidateProfile, rootDir } = require("../config");
const { log } = require("../logging/logger");

const DEFAULT_MODEL = "qwen2.5-coder:14b";
const FALLBACK_MODELS = ["llama3.1", "deepseek-coder", "mistral"];

function enabled() {
  return String(process.env.OLLAMA_ENABLED || "true").toLowerCase() !== "false";
}

function ollamaUrl() {
  return process.env.OLLAMA_URL || "http://localhost:11434";
}

function cacheDir() {
  const dir = path.join(rootDir(), ".cache", "ollama");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheKey(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function readCache(key) {
  const file = path.join(cacheDir(), `${key}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeCache(key, value) {
  fs.writeFileSync(path.join(cacheDir(), `${key}.json`), `${JSON.stringify(value, null, 2)}\n`);
}

function compactProfile() {
  const profile = candidateProfile();
  return {
    title: profile.title,
    current_company: profile.current_company,
    current_ctc: profile.current_ctc,
    positioning: profile.positioning,
    skills: profile.skills,
    achievements: profile.achievements,
    metrics: profile.metrics
  };
}

function compactJob(job) {
  return {
    company: job.company,
    title: job.title || job.role,
    location: job.location,
    source: job.source,
    salary_estimate: job.salary_estimate || job.compensation_hint || "",
    jd_excerpt: String(job.jd || "").replace(/\s+/g, " ").slice(0, 2200)
  };
}

function extractJson(content) {
  const text = String(content || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Ollama response did not contain JSON");
    return JSON.parse(match[0]);
  }
}

async function withTimeout(promise, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllama({ model, system, user, temperature = 0.1, timeoutMs }) {
  const started = Date.now();
  const response = await withTimeout((signal) => fetch(`${ollamaUrl()}/api/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      format: "json",
      options: {
        temperature,
        num_predict: 700
      },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  }), timeoutMs);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama ${model} failed ${response.status}: ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const usage = {
    model,
    prompt_tokens: data.prompt_eval_count || 0,
    completion_tokens: data.eval_count || 0,
    total_duration_ms: data.total_duration ? Math.round(data.total_duration / 1e6) : Date.now() - started,
    wall_ms: Date.now() - started
  };

  return { json: extractJson(data.message?.content), usage };
}

async function chatJson({ system, user, strong = false, temperature = 0.1, timeoutMs }) {
  if (!enabled()) return null;

  const primary = strong ? (process.env.OLLAMA_STRONG_MODEL || DEFAULT_MODEL) : (process.env.OLLAMA_MODEL || DEFAULT_MODEL);
  const models = [primary, ...FALLBACK_MODELS.filter((item) => item !== primary)];
  const payload = { system, user, strong, temperature, primary };
  const key = cacheKey(payload);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  let lastError = null;
  const retries = Number(process.env.OLLAMA_RETRIES || 2);
  const timeout = timeoutMs || Number(process.env.OLLAMA_TIMEOUT_MS || 90000);

  for (const model of models) {
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const result = await callOllama({ model, system, user, temperature, timeoutMs: timeout });
        writeCache(key, result);
        log("llm.ollama.complete", { model, cached: false, wall_ms: result.usage.wall_ms });
        return result;
      } catch (error) {
        lastError = error;
        log("llm.ollama.failed", { model, attempt, error: error.message });
      }
    }
  }

  throw lastError || new Error("Ollama inference failed");
}

async function enhanceFitScore(job, heuristicScore) {
  return chatJson({
    system: "Return compact JSON only. Score backend job fit for the candidate. Be conservative. Never use disallowed titles.",
    user: JSON.stringify({
      task: "Return fit_score, compensation_probability, career_upside, interview_probability, priority, risks.",
      candidate: compactProfile(),
      heuristic_score: heuristicScore,
      job: compactJob(job)
    })
  });
}

async function extractAtsDeltas(job) {
  return chatJson({
    system: "Return compact JSON only. Extract ATS deltas from the job description.",
    user: JSON.stringify({
      task: "Return keywords, skills_order, project_priority, must_include_terms. No invented skills.",
      candidate_skills: compactProfile().skills,
      job: compactJob(job)
    })
  });
}

async function tailorResumeDeltas(job) {
  return chatJson({
    strong: true,
    system: "Return compact JSON only. Mutate resume deltas only. Do not invent experience, companies, or technologies.",
    user: JSON.stringify({
      task: "Return summary, ordered_skills, project_order, keywords. Keep ATS one-page style.",
      candidate: compactProfile(),
      job: compactJob(job)
    })
  });
}

async function recruiterOutreach(job) {
  return chatJson({
    system: "Return compact JSON only. Write recruiter outreach.",
    user: JSON.stringify({
      task: "Return message 80-120 words. Mention current company, backend systems, competitive programming, and role alignment.",
      candidate: compactProfile(),
      recruiter: job.recruiter || "",
      job: compactJob(job)
    }),
    timeoutMs: 45000
  });
}

module.exports = { enabled, enhanceFitScore, extractAtsDeltas, tailorResumeDeltas, recruiterOutreach };
