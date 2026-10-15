const { normalizeJob, stripHtml } = require('../normalize');

class GreenhouseAdapter {
  async fetchJobs(source) {
    const { boardToken } = source.config || {};
    if (!boardToken) throw new Error('Greenhouse boardToken missing in config');

    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Greenhouse API failed: ${response.statusText}`);

    const data = await response.json();
    return (data.jobs || []).map(item => ({
      company: source.name,
      title: item.title,
      jd: stripHtml(item.content),
      url: item.absolute_url,
      location: item.location?.name || "",
      source: 'greenhouse',
      sourceId: source.id,
      raw: item
    }));
  }
}

module.exports = new GreenhouseAdapter();
