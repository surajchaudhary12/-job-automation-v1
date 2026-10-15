const { readJson } = require("../config");
const { discoverGreenhouse } = require("./greenhouse");
const { discoverLever } = require("./lever");
const { discoverWellfound } = require("./wellfound");
const { discoverLinkedIn } = require("./linkedin");
const { discoverInstahyre } = require("./instahyre");
const { discoverHirist } = require("./hirist");
const { launchPersistentProfile } = require("../browser/session");
const { log } = require("../logging/logger");

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

  // ATS boards are simple HTTP fetches, no browser needed
  all.push(...await discoverGreenhouse(options.greenhouse_boards || sources.greenhouse_boards));
  all.push(...await discoverLever(options.lever_companies || sources.lever_companies));
  
  const queries = sources.queries || ["backend engineer"];
  const limitPerQuery = 10;

  // Platform-first discovery to minimize browser launches
  const platforms = [
    { name: "linkedin", discover: discoverLinkedIn },
    { name: "wellfound", discover: discoverWellfound },
    { name: "instahyre", discover: discoverInstahyre },
    { name: "hirist", discover: discoverHirist }
  ];

  for (const platform of platforms) {
    if (!process.env.LIVE_BROWSER_DISCOVERY) continue;

    log("discovery.platform.start", { platform: platform.name });
    const context = await launchPersistentProfile(platform.name);
    
    try {
      for (const query of queries) {
        log("discovery.query.start", { platform: platform.name, query });
        const jobs = await platform.discover({ 
          query, 
          limit: limitPerQuery, 
          existingContext: context 
        });
        all.push(...jobs);
      }
    } catch (error) {
      log("discovery.platform.error", { platform: platform.name, error: error.message });
    } finally {
      await context.close();
      log("discovery.platform.complete", { platform: platform.name });
    }
  }

  return dedupeJobs(all).slice(0, options.limit || 50);
}

module.exports = { discoverJobs };
