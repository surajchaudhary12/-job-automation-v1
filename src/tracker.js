const fs = require("fs");
const path = require("path");

function readTracker(rootDir) {
  const trackerPath = path.join(rootDir, "tracker", "applications.json");
  return JSON.parse(fs.readFileSync(trackerPath, "utf8"));
}

function writeTracker(rootDir, entries) {
  const trackerPath = path.join(rootDir, "tracker", "applications.json");
  fs.writeFileSync(trackerPath, `${JSON.stringify(entries, null, 2)}\n`);
}

function upsertApplication(rootDir, entry) {
  const entries = readTracker(rootDir);
  const index = entries.findIndex((existing) => existing.company === entry.company && existing.role === entry.role);
  const created = index < 0;
  if (created) entries.push(entry);
  else entries[index] = { ...entries[index], ...entry };
  writeTracker(rootDir, entries);
  return {
    created,
    updated: !created,
    persistedCount: entries.length,
    entry: created ? entry : entries[index]
  };
}

function entryId(entry) {
  return Buffer.from(`${entry.company}::${entry.role}`).toString("base64url");
}

function findApplication(rootDir, id) {
  return readTracker(rootDir).find((entry) => entryId(entry) === id);
}

function updateApplication(rootDir, id, patch) {
  const entries = readTracker(rootDir);
  const index = entries.findIndex((entry) => entryId(entry) === id);
  if (index < 0) return null;
  entries[index] = {
    ...entries[index],
    ...patch,
    updated_at: new Date().toISOString()
  };
  writeTracker(rootDir, entries);
  return entries[index];
}

function readLogs(rootDir, limit = 200) {
  const logPath = path.join(rootDir, "logs", "app.log");
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { ts: "", event: "parse_error", raw: line };
      }
    });
}

module.exports = { readTracker, upsertApplication, entryId, findApplication, updateApplication, readLogs };
