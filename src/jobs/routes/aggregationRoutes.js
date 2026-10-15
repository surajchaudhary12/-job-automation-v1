const express = require('express');
const aggregationService = require('../services/aggregationService');
const aggregationQueue = require('../queues/aggregationQueue');
const prisma = require('../../db/prisma');
const { JobSourceSchema } = require('../utils/validation');

const router = express.Router();

// Sources
router.get('/sources', async (req, res) => {
  try {
    const sources = await aggregationService.listSources();
    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sources', async (req, res) => {
  try {
    const validated = JobSourceSchema.parse(req.body);
    const source = await prisma.jobSource.create({
      data: validated,
    });
    res.status(201).json(source);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/sources/:id/run', async (req, res) => {
  try {
    await aggregationQueue.add({
      type: 'AGGREGATE_SOURCE',
      sourceId: req.params.id,
    });
    res.json({ status: 'queued', message: 'Aggregation task added to queue' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Jobs
router.get('/jobs', async (req, res) => {
  try {
    const { status, company, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (company) where.company = { contains: company, mode: 'insensitive' };

    const jobs = await prisma.job.findMany({
      where,
      take: Number(limit),
      skip: Number(offset),
      orderBy: { createdAt: 'desc' },
      include: { jobSource: true },
    });

    const total = await prisma.job.count({ where });

    res.json({
      jobs,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
