const { performance } = require("perf_hooks");

function ollamaUrl() {
  return process.env.OLLAMA_URL || "http://localhost:11434";
}

async function ollamaHealth() {
  const model = process.env.OLLAMA_MODEL || "qwen2.5-coder:14b";
  const started = performance.now();
  try {
    const response = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const latencyMs = Math.round(performance.now() - started);
    if (!response.ok) {
      return { daemon: false, model, model_available: false, latency_ms: latencyMs, error: `HTTP ${response.status}` };
    }
    const data = await response.json();
    const models = (data.models || []).map((item) => item.name);
    return {
      daemon: true,
      model,
      model_available: models.includes(model),
      available_models: models,
      latency_ms: latencyMs,
      url: ollamaUrl()
    };
  } catch (error) {
    return {
      daemon: false,
      model,
      model_available: false,
      available_models: [],
      latency_ms: Math.round(performance.now() - started),
      url: ollamaUrl(),
      error: error.message
    };
  }
}

module.exports = { ollamaHealth };
