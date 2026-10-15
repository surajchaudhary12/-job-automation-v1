const { normalizeJob, stripHtml } = require('../normalize');

class LeverAdapter {
  async fetchJobs(source) {
    const { companyHandle } = source.config || {};
    if (!companyHandle) throw new Error('Lever companyHandle missing in config');

    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(companyHandle)}?mode=json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Lever API failed: ${response.statusText}`);

    const data = await response.json();
    return (data || []).map(item => ({
      company: source.name,
      title: item.text,
      jd: stripHtml(`${item.descriptionPlain || ""} ${item.lists?.map((list) => `${list.text} ${list.content}`).join(" ") || ""}`),
      url: item.hostedUrl || item.applyUrl,
      location: item.categories?.location || "",
      source: 'lever',
      sourceId: source.id,
      raw: item
    }));
  }
}

module.exports = new LeverAdapter();
