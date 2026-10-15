import sqlite3 from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || join(__dirname, 'data', 'jobs.db');

// Ensure data directory exists
if (!fs.existsSync(dirname(dbPath))) {
  fs.mkdirSync(dirname(dbPath), { recursive: true });
}

const db = new sqlite3(dbPath);

// Initialize schema (Requirement 5)
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jobId TEXT UNIQUE,
    title TEXT,
    company TEXT,
    location TEXT,
    postedAt TEXT,
    jobUrl TEXT,
    snippet TEXT,
    scrapedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    fitScore REAL,
    status TEXT DEFAULT 'new'
  )
`);

export const dbHelper = {
  isJobExists: (jobId) => {
    const stmt = db.prepare('SELECT 1 FROM jobs WHERE jobId = ?');
    return !!stmt.get(jobId);
  },

  saveJob: (job) => {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO jobs (jobId, title, company, location, postedAt, jobUrl, snippet)
      VALUES (@jobId, @title, @company, @location, @postedAt, @jobUrl, @snippet)
    `);
    return stmt.run(job);
  },

  getJobs: (status = 'new', limit = 20, offset = 0) => {
    const stmt = db.prepare('SELECT * FROM jobs WHERE status = ? ORDER BY scrapedAt DESC LIMIT ? OFFSET ?');
    return stmt.all(status, limit, offset);
  },

  getJob: (jobId) => {
    const stmt = db.prepare('SELECT * FROM jobs WHERE jobId = ?');
    return stmt.get(jobId);
  },

  updateJob: (jobId, updates) => {
    const allowed = ['status', 'fitScore'];
    const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
    if (entries.length === 0) return { changes: 0 };
    
    const fields = entries.map(([k]) => `${k} = ?`).join(', ');
    const values = entries.map(([, v]) => v);
    const stmt = db.prepare(`UPDATE jobs SET ${fields} WHERE jobId = ?`);
    return stmt.run(...values, jobId);
  },

  getStats: () => {
    const total = db.prepare('SELECT count(*) as count FROM jobs').get().count;
    const stats = db.prepare('SELECT status, count(*) as count FROM jobs GROUP BY status').all();
    const todayCount = db.prepare("SELECT count(*) as count FROM jobs WHERE date(scrapedAt) = date('now')").get().count;
    
    const result = { total, todayCount, new: 0, reviewed: 0, applied: 0, dismissed: 0 };
    stats.forEach(s => { result[s.status] = s.count; });
    return result;
  },

  getTodayScrapeCount: () => {
    return db.prepare("SELECT count(*) as count FROM jobs WHERE date(scrapedAt) = date('now')").get().count;
  }
};
