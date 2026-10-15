const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { candidateProfile, rootDir } = require("../config");
const { log } = require("../logging/logger");

const DEFAULT_MODEL = "qwen2.5-coder:14b";
const FALLBACK_MODELS = ["qwen2.5-coder:7b", "llama3.1", "deepseek-coder", "mistral"];

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
    metrics: profile.metrics,
    disallowed_titles: [
      "Business Analyst",
      "Frontend engineer",
      "AI researcher",
      "DevOps engineer"
    ],
    preferred_roles: [
      "Backend engineering",
      "Java/C++",
      "Systems",
      "Platform",
      "Product engineering"
    ]
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
    headers: { 
      "Content-Type": "application/json"
    },
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

  const primary = (strong ? process.env.OLLAMA_STRONG_MODEL : process.env.OLLAMA_MODEL) || DEFAULT_MODEL;
  log("llm.ollama.debug", { primary, env: process.env.OLLAMA_MODEL, DEFAULT_MODEL });
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
    system: "Return compact JSON only. You are a senior technical recruiter scoring a backend job fit for a specific candidate. Be conservative and critical. Prioritize backend engineering, Java/C++, and strong engineering cultures. Auto-reject if mandatory experience exceeds 6 years or if the role is frontend-heavy or pure DevOps.",
    user: JSON.stringify({
      task: "Analyze the job description and candidate profile. Return a JSON object with: fit_score (0-10), compensation_probability ('High', 'Medium', 'Low'), career_upside ('High', 'Medium', 'Low'), interview_probability ('High', 'Medium', 'Low'), priority ('High', 'Medium', 'Low'), and risks (list of strings).",
      candidate: compactProfile(),
      heuristic_score: heuristicScore,
      job: compactJob(job),
      criteria: [
        "Skill match: Java, Spring Boot, C++, Systems, DSA",
        "Experience realism: Suraj is an Analyst with 20 LPA, don't score Staff/Principal roles high unless they are reachable.",
        "Compensation: Must likely exceed 20 LPA (prefer > 25 LPA).",
        "Targeting: Backend, Platform, Systems, Product companies.",
        "Red flags: Service companies, weak engineering culture, pure frontend, 6+ YOE mandatory."
      ]
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
    system: "Return compact JSON only. Tailor resume deltas using only supplied candidate facts. Do not invent or alter experience, companies, titles, dates, technologies, metrics, or outcomes. Keep the candidate's current title as Analyst. Every numeric claim in the summary must exactly match the profile.",
    user: JSON.stringify({
      task: "Return a concise 1-2 sentence summary, ordered_skills, project_order, and keywords. Only list skills and projects that exactly exist in the candidate profile; order them by relevance to the job. Keep ATS one-page style.",
      candidate: candidateProfile(),
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

async function answerApplicationQuestions(job, questions) {
  return chatJson({
    system: "Return compact JSON only. Answer application questions for the candidate. Be professional and technical. Do not invent experience.",
    user: JSON.stringify({
      task: "Return an object where keys are question IDs/labels and values are concise answers.",
      candidate: compactProfile(),
      job: compactJob(job),
      questions
    }),
    timeoutMs: 60000
  });
}

module.exports = { enabled, enhanceFitScore, extractAtsDeltas, tailorResumeDeltas, recruiterOutreach, answerApplicationQuestions };
