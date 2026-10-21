const { normalizeJob, isRelevantJob, stripHtml } = require("./normalize");

async function discoverAshby(boards = []) {
  const jobs = [];

  for (const board of boards) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      for (const item of data.jobs || []) {
        if (item.isListed === false) continue;
        const compensation = item.compensation?.scrapeableCompensationSalarySummary
          || item.compensation?.compensationTierSummary
          || "";
        const job = normalizeJob({
          company: board,
          title: item.title,
          jd: stripHtml(item.descriptionHtml || item.description || item.summary || ""),
          url: item.applyUrl || item.jobUrl,
          location: item.location || "",
          salary_estimate: compensation,
          source: "ashby"
        });
        if (isRelevantJob(job)) jobs.push(job);
      }
    } catch {
      continue;
    }
  }

  return jobs;
}

module.exports = { discoverAshby };
