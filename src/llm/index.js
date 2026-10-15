const ollama = require("./ollama");

// Provider Abstraction Layer
// Strictly follows AGENT_RULES.md: Use only local Ollama models.
function getProvider() {
  return ollama;
}

module.exports = getProvider();