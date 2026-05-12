const { normalizeJob, isRelevantJob, stripHtml } = require("./normalize");

async function discoverGreenhouse(boardTokens = []) {
  const jobs = [];

  for (const board of boardTokens) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      for (const item of data.jobs || []) {
        const location = item.location?.name || "";
        const job = normalizeJob({
          company: board,
          title: item.title,
          jd: stripHtml(item.content),
          url: item.absolute_url,
          location,
          source: "greenhouse"
        });
        if (isRelevantJob(job)) jobs.push(job);
      }
    } catch (error) {
      jobs.push(normalizeJob({
        company: board,
        title: "Discovery error",
        jd: error.message,
        url,
        source: "greenhouse:error"
      }));
    }
  }

  return jobs.filter((job) => job.title !== "Discovery error");
}

module.exports = { discoverGreenhouse };
