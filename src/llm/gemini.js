const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { candidateProfile, rootDir } = require("../config");
const { log } = require("../logging/logger");

const DEFAULT_MODEL = "gemini-2.5-flash";

function enabled() {
  return !!process.env.GEMINI_API_KEY;
}

function cacheDir() {
  const dir = path.join(rootDir(), ".cache", "gemini");
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
    if (!match) throw new Error("Gemini response did not contain JSON");
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

async function callGemini({ model, system, user, temperature = 0.1, timeoutMs }) {
  const started = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not found in environment");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      temperature,
      responseMimeType: "application/json"
    }
  };

  const response = await withTimeout((signal) => fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  }), timeoutMs);

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini ${model} failed ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  
  const usage = {
    model,
    prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
    completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
    total_duration_ms: Date.now() - started,
    wall_ms: Date.now() - started
  };

  return { json: extractJson(content), usage };
}

async function chatJson({ system, user, strong = false, temperature = 0.1, timeoutMs }) {
  if (!enabled()) return null;

  const model = strong ? "gemini-2.5-pro" : DEFAULT_MODEL;
  log("llm.gemini.debug", { model });
  const payload = { system, user, strong, temperature, model };
  const key = cacheKey(payload);
  const cached = readCache(key);
  if (cached) return { ...cached, cached: true };

  let lastError = null;
  const retries = 2;
  const timeout = timeoutMs || 90000;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const result = await callGemini({ model, system, user, temperature, timeoutMs: timeout });
      writeCache(key, result);
      log("llm.gemini.complete", { model, cached: false, wall_ms: result.usage.wall_ms });
      return result;
    } catch (error) {
      lastError = error;
      log("llm.gemini.failed", { model, attempt, error: error.message });
    }
  }

  throw lastError || new Error("Gemini inference failed");
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

module.exports = { enabled, enhanceFitScore, extractAtsDeltas, tailorResumeDeltas, recruiterOutreach, callGemini };