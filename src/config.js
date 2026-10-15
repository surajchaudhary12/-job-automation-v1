const fs = require("fs");
const path = require("path");
require("dotenv").config({ override: true, quiet: true });

function rootDir() {
  return path.resolve(__dirname, "..");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir(), relativePath), "utf8"));
}

function candidateProfile() {
  return readJson("config/candidate_profile.json");
}

function applicationPreferences() {
  return candidateProfile().application_preferences || {};
}

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

module.exports = { rootDir, readJson, candidateProfile, applicationPreferences, envFlag, envNumber };
