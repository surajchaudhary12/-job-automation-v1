import express from 'express';
import { dbHelper } from './db.js';
import { scrapeRun } from './scraper.js';

const app = express();
app.use(express.json());

const PORT = 3001;

// GET /api/jobs?status=new&limit=20&offset=0
app.get('/api/jobs', (req, res) => {
  const { status = 'new', limit = 20, offset = 0 } = req.query;
  const jobs = dbHelper.getJobs(status, parseInt(limit), parseInt(offset));
  res.json(jobs);
});

// GET /api/jobs/:jobId
app.get('/api/jobs/:jobId', (req, res) => {
  const job = dbHelper.getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// PATCH /api/jobs/:jobId
router.patch('/jobs/:jobId', (req, res) => {

  const { status, fitScore } = req.body;
  const updates = {};
  if (status) updates.status = status;
  if (fitScore !== undefined) updates.fitScore = fitScore;
  
  try {
    dbHelper.updateJob(req.params.jobId, updates);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  const stats = dbHelper.getStats();
  res.json(stats);
});

// POST /api/scrape/trigger
app.post('/api/scrape/trigger', async (req, res) => {
  console.log('[API] Manual scrape triggered.');
  scrapeRun()
    .then(result => res.json(result))
    .catch(err => res.status(500).json({ error: err.message }));
});

export function startApi() {
  app.listen(PORT, () => {
    console.log(`[API] Server listening on port ${PORT}`);
  });
}
