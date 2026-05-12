const { normalizeJob, isRelevantJob, stripHtml } = require("./normalize");

async function discoverLever(companies = []) {
  const jobs = [];

  for (const company of companies) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(company)}?mode=json`;
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      for (const item of data || []) {
        const location = item.categories?.location || "";
        const job = normalizeJob({
          company,
          title: item.text,
          jd: stripHtml(`${item.descriptionPlain || ""} ${item.lists?.map((list) => `${list.text} ${list.content}`).join(" ") || ""}`),
          url: item.hostedUrl || item.applyUrl,
          location,
          source: "lever"
        });
        if (isRelevantJob(job)) jobs.push(job);
      }
    } catch {
      continue;
    }
  }

  return jobs;
}

module.exports = { discoverLever };
