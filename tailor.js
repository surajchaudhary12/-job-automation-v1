const { candidateProfile, rootDir } = require("../config");
const { log } = require("../logging/logger");
const { callOllama } = require("../llm/ollama"); // Current Ollama inference module

async function tailorResumeDeltas(job) {
  const strong = true;
  const system = "Return compact JSON only. Mutate resume deltas only. Do not invent experience, companies, or technologies.";
  const user = JSON.stringify({
    task: "Return summary, ordered_skills, project_order, keywords. Keep ATS one-page style.",
    candidate: candidateProfile(),
    job: job
  });

  try {
    log("pipeline.tailor.resume.request", { job });
    const result = await callOllama({ model: "qwen2.5-coder:14b", system, user, strong });
    log("pipeline.tailor.resume.response", { result });
    return result.json;
  } catch (error) {
    log("pipeline.tailor.resume.error", { error: error.message });
    throw new Error("Resume tailoring failed");
  }
}

module.exports = { tailorResumeDeltas };
