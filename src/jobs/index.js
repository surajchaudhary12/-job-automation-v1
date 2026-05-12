const { readJson } = require("../config");
const { discoverGreenhouse } = require("./greenhouse");
const { discoverLever } = require("./lever");
const { discoverWellfound } = require("./wellfound");
const { discoverLinkedIn } = require("./linkedin");

function dedupeJobs(jobs) {
  const seen = new Set();
  const output = [];
  for (const job of jobs) {
    const key = `${job.source}:${job.url || job.company + job.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(job);
  }
  return output;
}

async function discoverJobs(options = {}) {
  const sources = readJson("config/job_sources.json");
  const all = [];

  all.push(...await discoverGreenhouse(options.greenhouse_boards || sources.greenhouse_boards));
  all.push(...await discoverLever(options.lever_companies || sources.lever_companies));
  all.push(...await discoverWellfound({ query: sources.queries[0], limit: options.limit || 10 }));
  all.push(...await discoverLinkedIn({ query: sources.queries[0], limit: options.limit || 10 }));

  return dedupeJobs(all).slice(0, options.limit || 50);
}

module.exports = { discoverJobs };
